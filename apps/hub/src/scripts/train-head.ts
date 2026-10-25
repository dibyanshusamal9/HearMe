/**
 * Trains the need classifier that sits on top of multilingual-e5 (see
 * packages/shared/src/matching/head.ts) and saves apps/hub/data/need-head.json.
 *
 *   npm run train -w @hearme/hub
 *
 * Training data is generated, not collected: every catalogue phrase in a few
 * request templates per language ("मुझे {k} चाहिए", "{k}をください", "cho tôi
 * {k}" …), with purposes, plus copies misspelled the way Whisper misspells
 * (डवा for दवा, missing Thai tone marks, Vietnamese without accents), plus the
 * 144-phrase tuning set. The held-out phrases and the saved Whisper
 * transcripts are never trained on: they are what the report below measures.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIDENCE_THRESHOLD,
  LANGUAGES,
  LOCALE_PACKS,
  NEEDS,
  NeedHead,
  localePack,
  needLabel,
  PURPOSE_PHRASES,
  buildNeedIndex,
  combineMatches,
  createKeywordMatcher,
  headSignal,
  rankByIndex,
  semanticConfidence,
  type LangCode,
  type MatchResult,
} from '@hearme/shared';
import { createE5 } from '../ai';
import { loadLanguagePacks } from '../langpacks';
import { EMBED_MODEL, inferenceThreads } from '../models';
import { HELDOUT_PHRASES, NEED_PHRASES } from './evalData';

const HUB = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(HUB, 'data', 'need-head.json');
/** Every language HearMe offers, so the classifier is trained on the pack languages too. */
const LANGS: LangCode[] = LANGUAGES.map((l) => l.code);

// ── Generated training data ───────────────────────────────────────────────
/**
 * Request templates per language. Core languages are written out; pack
 * languages supply their own in `i18n/packs/<code>.ts`, so adding a language
 * does not mean editing this script.
 */
const CORE_TEMPLATES: Partial<Record<LangCode, string[]>> = {
  en: ['{k}', 'I need {k}', 'can I have {k} please', 'could you bring me {k}', '{k} please', 'excuse me, {k}'],
  hi: ['{k}', 'मुझे {k} चाहिए', '{k} दे दीजिए', 'क्या {k} मिल सकता है', 'प्लीज़ {k}'],
  ja: ['{k}', '{k}をください', '{k}お願いします', 'すみません、{k}', '{k}をもらえますか'],
  th: ['{k}', 'ขอ{k}หน่อย', 'ขอ{k}ครับ', 'ขอ{k}ค่ะ', 'อยากได้{k}'],
  id: ['{k}', 'minta {k}', 'saya mau {k}', 'boleh minta {k}', 'tolong {k}'],
  vi: ['{k}', 'cho tôi {k}', 'tôi cần {k}', 'xin {k}', 'làm ơn cho tôi {k}'],
};
const ROMAN_HI = ['{k}', 'mujhe {k} chahiye', '{k} chahiye', '{k} de dijiye'];

const templatesFor = (lang: LangCode): string[] => CORE_TEMPLATES[lang] ?? localePack(lang)?.templates ?? ['{k}'];

const script = (s: string) =>
  /[ऀ-ॿ]/.test(s) ? 'deva' : /[฀-๿]/.test(s) ? 'thai' : /[぀-ヿ一-鿿]/.test(s) ? 'jpan' : 'latn';

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);

const SWAP_HI: Record<string, string> = { द: 'ड', ड: 'द', त: 'ट', ट: 'त', 'ि': 'ी', 'ी': 'ि', 'ु': 'ू', 'ू': 'ु', व: 'ब', ब: 'व', श: 'स', स: 'श', ठ: 'थ', थ: 'ठ' };
const SWAP_TH: Record<string, string> = { ผ: 'พ', ภ: 'พ', พ: 'ภ', ส: 'ซ', ซ: 'ส', ข: 'ค', ค: 'ข', ท: 'ธ' };

/** A copy spelled the way Whisper might hear it. */
function misspell(text: string, lang: LangCode): string {
  switch (lang) {
    case 'hi':
      return [...text.replace(/़/g, '').replace(/ं/g, () => (rand() < 0.5 ? 'न' : 'ं'))]
        .map((c) => (SWAP_HI[c] && rand() < 0.35 ? SWAP_HI[c] : c))
        .join('');
    case 'th':
      return [...text.replace(/[่-๋]/g, () => (rand() < 0.6 ? '' : '่')).replace(/ห(?=[งนมยรลว])/g, () => (rand() < 0.6 ? '' : 'ห'))]
        .map((c) => (SWAP_TH[c] && rand() < 0.35 ? SWAP_TH[c] : c))
        .join('');
    case 'vi': {
      let t = rand() < 0.4 ? text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D') : text;
      if (rand() < 0.5) t = t.replace(/\bs/g, 'x');
      if (rand() < 0.5) t = t.replace(/\btr/g, 'ch');
      if (rand() < 0.5) t = t.replace(/n\b/g, 'ng');
      return t;
    }
    case 'ja':
      return text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
    default:
      return text;
  }
}

interface Example {
  text: string;
  need: string;
}

function generate(): Example[] {
  const out: Example[] = [];
  const add = (text: string, need: string) => out.push({ text: text.trim(), need });
  for (const need of NEEDS) {
    for (const lang of LANGS) {
      const keywords = [...new Set([needLabel(need, lang), ...(need.phrases[lang] ?? [])])];
      for (const k of keywords) {
        const templates = lang === 'hi' && script(k) === 'latn' ? ROMAN_HI : templatesFor(lang);
        for (const t of templates) add(t.replace('{k}', k), need.id);
        for (const p of need.purposes ?? []) {
          for (const w of PURPOSE_PHRASES[p] ?? []) if (script(w) === script(k)) add(`${k} ${w}`, need.id);
        }
      }
    }
  }
  // Extra packs dropped into data/languages/*.json (npm run add-language drafts): their keywords in their own templates.
  for (const pack of loadLanguagePacks()) {
    for (const [need, words] of Object.entries(pack.needs)) {
      if (!NEEDS.some((n) => n.id === need)) continue;
      for (const k of words) for (const t of pack.templates ?? ['{k}']) add(t.replace('{k}', k), need);
    }
    for (const [need, sentences] of Object.entries(pack.examples ?? {})) {
      if (NEEDS.some((n) => n.id === need)) for (const e of sentences) add(e, need);
    }
  }
  // Built-in packs' example sentences (i18n/packs/<code>.ts).
  for (const pack of LOCALE_PACKS) {
    for (const [need, sentences] of Object.entries(pack.examples ?? {})) {
      if (NEEDS.some((n) => n.id === need)) for (const e of sentences) add(e, need);
    }
  }
  for (const [, needs] of Object.entries(NEED_PHRASES)) {
    for (const [need, phrases] of Object.entries(needs)) for (const p of Array.isArray(phrases) ? phrases : [phrases]) add(p, need);
  }
  // Misspelled copies for the languages Whisper spells inconsistently.
  const base = [...out];
  for (const ex of base) {
    const lang = ({ deva: 'hi', thai: 'th', jpan: 'ja' } as const)[script(ex.text) as 'deva' | 'thai' | 'jpan'] ?? (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(ex.text) ? 'vi' : null);
    if (!lang) continue;
    const m = misspell(ex.text, lang);
    if (m !== ex.text) add(m, ex.need);
  }
  // Drop duplicates, and texts that appear under two different needs.
  const byText = new Map<string, Set<string>>();
  for (const e of out) byText.set(e.text, (byText.get(e.text) ?? new Set()).add(e.need));
  return [...byText.entries()].filter(([, s]) => s.size === 1).map(([text, s]) => ({ text, need: [...s][0]! }));
}

// ── Softmax regression, full batch, Adam ─────────────────────────────────
function train(X: Float32Array[], y: number[], K: number, epochs = 160, lr = 0.02, l2 = 1e-4) {
  const D = X[0]!.length;
  const n = X.length;
  const W = Array.from({ length: K }, () => new Float64Array(D));
  const b = new Float64Array(K);
  const counts = new Float64Array(K);
  for (const c of y) counts[c]! += 1;
  const classWeight = Array.from(counts, (c) => (c ? n / (K * c) : 0));
  const m = Array.from({ length: K }, () => new Float64Array(D + 1));
  const v = Array.from({ length: K }, () => new Float64Array(D + 1));
  const logits = new Float64Array(K);
  for (let epoch = 1; epoch <= epochs; epoch++) {
    const gW = Array.from({ length: K }, () => new Float64Array(D + 1));
    let loss = 0;
    for (let i = 0; i < n; i++) {
      const x = X[i]!;
      let max = -Infinity;
      for (let k = 0; k < K; k++) {
        let s = b[k]!;
        const row = W[k]!;
        for (let d = 0; d < D; d++) s += row[d]! * x[d]!;
        logits[k] = s;
        if (s > max) max = s;
      }
      let sum = 0;
      for (let k = 0; k < K; k++) sum += (logits[k] = Math.exp(logits[k]! - max));
      const cw = classWeight[y[i]!]!;
      loss -= cw * Math.log(logits[y[i]!]! / sum);
      for (let k = 0; k < K; k++) {
        const g = cw * (logits[k]! / sum - (k === y[i] ? 1 : 0));
        if (Math.abs(g) < 1e-6) continue;
        const gk = gW[k]!;
        for (let d = 0; d < D; d++) gk[d]! += g * x[d]!;
        gk[D]! += g;
      }
    }
    for (let k = 0; k < K; k++) {
      for (let d = 0; d <= D; d++) {
        const w = d < D ? W[k]![d]! : b[k]!;
        const g = gW[k]![d]! / n + (d < D ? l2 * w : 0);
        m[k]![d] = 0.9 * m[k]![d]! + 0.1 * g;
        v[k]![d] = 0.999 * v[k]![d]! + 0.001 * g * g;
        const step = (lr * (m[k]![d]! / (1 - 0.9 ** epoch))) / (Math.sqrt(v[k]![d]! / (1 - 0.999 ** epoch)) + 1e-8);
        if (d < D) W[k]![d] = w - step;
        else b[k] = w - step;
      }
    }
    if (epoch % 40 === 0) console.log(`  epoch ${epoch}: loss ${(loss / n).toFixed(3)}`);
  }
  return { W, b };
}

// ── Evaluation: how the head changes what passengers see ─────────────────
type Ranked = { id: string; score: number }[];
type Row = { expected: string; kw: MatchResult; ranked: Ranked; probs: { id: string; p: number }[] };
type Variant = (r: Row) => { ranked: Ranked; confidence: number };

const VARIANTS: Record<string, Variant> = {
  'e5 nearest example (now)': (r) => ({ ranked: r.ranked, confidence: semanticConfidence(r.ranked) }),
  'trained head': (r) => ({ ranked: r.probs.map((x) => ({ id: x.id, score: x.p })), confidence: r.probs[0]!.p }),
  'trained head, checked by e5 (used)': (r) => headSignal(r.ranked, r.probs),
};

function score(rows: Row[], variant: Variant) {
  let top1 = 0;
  let top3 = 0;
  let sent = 0;
  let wrong = 0;
  for (const r of rows) {
    const m = combineMatches(r.kw, variant(r));
    const top = m.candidates[0]?.needId;
    if (top === r.expected) top1++;
    if (m.candidates.slice(0, 3).some((c) => c.needId === r.expected)) top3++;
    if (top && m.confidence >= CONFIDENCE_THRESHOLD) {
      sent++;
      if (top !== r.expected) wrong++;
    }
  }
  const pct = (x: number) => `${Math.round((100 * x) / rows.length)}%`;
  return { top1: pct(top1), top3: pct(top3), sent: pct(sent), wrongButConfident: pct(wrong) };
}

async function main() {
  console.log('▶ Generating training requests …');
  const examples = generate();
  const labels = NEEDS.map((n) => n.id);
  console.log(`  ${examples.length} requests for ${labels.length} needs`);

  console.log('▶ Embedding with multilingual-e5 …');
  const e5 = await createE5(inferenceThreads());
  const X: Float32Array[] = [];
  for (let i = 0; i < examples.length; i += 64) X.push(...(await e5.embed(examples.slice(i, i + 64).map((e) => e.text), 'query')));
  const y = examples.map((e) => labels.indexOf(e.need));

  console.log('▶ Training …');
  const { W, b } = train(X, y, labels.length);
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  const params = { model: EMBED_MODEL, labels, weights: W.map((row) => Array.from(row, r5)), bias: Array.from(b, r5), trainedOn: examples.length, at: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(params));
  const head = new NeedHead(params);
  console.log(`  saved ${OUT}`);

  console.log('▶ Measuring (none of these were trained on except the tuning set) …');
  const keyword = createKeywordMatcher();
  const index = await buildNeedIndex(e5, NEEDS);
  const rowsFor = async (items: { text: string; expected: string }[]) => {
    const rows: Row[] = [];
    for (let i = 0; i < items.length; i += 64) {
      const chunk = items.slice(i, i + 64);
      const qs = await e5.embed(chunk.map((c) => c.text || ' '), 'query');
      chunk.forEach((c, j) => rows.push({ expected: c.expected, kw: keyword.match(c.text), ranked: rankByIndex(index, qs[j]!).slice(0, 6), probs: head.predict(qs[j]!) }));
    }
    return rows;
  };
  const fromSet = (set: Record<string, Record<string, string | string[]>>) =>
    Object.values(set).flatMap((needs) => Object.entries(needs).flatMap(([expected, p]) => (Array.isArray(p) ? p : [p]).map((text) => ({ text, expected }))));
  const sets: Record<string, Row[]> = {
    'tuning (trained on)': await rowsFor(fromSet(NEED_PHRASES)),
    'held-out typed': await rowsFor(fromSet(HELDOUT_PHRASES)),
  };
  for (const size of ['small', 'base']) {
    const file = join(HUB, '.eval', `results-${size}.json`);
    if (!existsSync(file)) continue;
    const speech = (JSON.parse(readFileSync(file, 'utf8')) as { speech?: { rows: { transcript: string; expected: string }[] } }).speech;
    if (speech) sets[`speech, Whisper-${size}`] = await rowsFor(speech.rows.map((r) => ({ text: r.transcript, expected: r.expected })));
  }
  for (const [name, rows] of Object.entries(sets)) {
    console.log(`\n  ${name} (${rows.length})`);
    console.table(Object.fromEntries(Object.entries(VARIANTS).map(([v, fn]) => [v, score(rows, fn)])));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
