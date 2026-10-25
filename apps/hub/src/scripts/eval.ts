/**
 * Measures how well HearMe understands requests — instead of claiming it.
 *
 *   npm run eval                      typed phrases (144) + crew phrases, keyword vs keyword+e5
 *   npm run eval -- --speech          also synthetic speech (macOS `say` voices) through Whisper,
 *                                     clean and mixed with synthetic cabin noise
 *   npm run eval -- --speech --snr 10,0 --model base
 *
 * Results print as tables and are saved to apps/hub/.eval/results.json.
 * Honest caveat: synthetic voices are not real accents; this is a regression
 * check and a calibration tool, not a field trial.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIDENCE_THRESHOLD,
  SEMANTIC_CALIBRATION,
  buildNeedIndex,
  combineMatches,
  headSignal,
  type HeadProbability,
  createKeywordMatcher,
  rankByIndex,
  semanticConfidence,
  type Embedder,
  languageInfo,
  type LangCode,
  type MatchResult,
} from '@hearme/shared';
import { createE5, createWhisper, hasSpeech, highPass, HIGH_PASS_HZ, AiEngine } from '../ai';
import { denoise } from '../denoise';
import { loadNeedHead } from '../head';
import { inferenceThreads, type AsrSize } from '../models';
import { aggregateErrorRate, fmtRate } from '@hearme/shared/lab';
import { CREW_PHRASES, HELDOUT_PHRASES, NEED_PHRASES, VOICES } from './evalData';

const OUT = fileURLToPath(new URL('../../.eval/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const threads = inferenceThreads();
const keyword = createKeywordMatcher();

/** A set of test phrases: language → need → one phrasing or several. */
type PhraseSet = Partial<Record<LangCode, Record<string, string | string[]>>>;

interface Row {
  lang: LangCode;
  expected: string;
  text: string;
  kw: MatchResult;
  ranked: { id: string; score: number }[];
  probs?: HeadProbability[];
}

const head = loadNeedHead();

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');

function summarize(rows: Row[], label: string, useSemantic: boolean, useHead = false) {
  let top1 = 0;
  let inOptions = 0;
  let confident = 0;
  let confidentWrong = 0;
  for (const r of rows) {
    const sem = useHead && r.probs ? headSignal(r.ranked, r.probs) : { ranked: r.ranked, confidence: semanticConfidence(r.ranked) };
    const m = useSemantic ? combineMatches(r.kw, sem) : r.kw;
    const top = m.candidates[0]?.needId;
    const options = m.candidates.slice(0, 3).map((c) => c.needId);
    if (top === r.expected) top1 += 1;
    if (options.includes(r.expected)) inOptions += 1;
    if (top && m.confidence >= CONFIDENCE_THRESHOLD) {
      confident += 1;
      if (top !== r.expected) confidentWrong += 1;
    }
  }
  return {
    label,
    n: rows.length,
    top1: pct(top1, rows.length),
    rightPictureInTop3: pct(inOptions, rows.length),
    sentWithoutAsking: pct(confident, rows.length),
    wrongButConfident: pct(confidentWrong, rows.length),
    // The passenger has to fall back to tapping or typing: asked, and the right picture was not offered.
    fellBackToPictures: pct(rows.length - inOptions, rows.length),
    raw: { top1, inOptions, confident, confidentWrong },
  };
}

function byLanguage(rows: Row[]) {
  const langs = [...new Set(rows.map((r) => r.lang))];
  return Object.fromEntries(langs.map((l) => [l, summarize(rows.filter((r) => r.lang === l), l, true, !!head).top1]));
}

/** One row per language, so a pack language can be compared with a core one directly. */
function languageTable(rows: Row[]) {
  const langs = [...new Set(rows.map((r) => r.lang))];
  return langs.map((l) => {
    const info = languageInfo(l);
    const s = summarize(rows.filter((r) => r.lang === l), l, true, !!head);
    return {
      language: info.englishName,
      kind: info.core ? 'core' : 'pack',
      n: s.n,
      top1: s.top1,
      rightPictureInTop3: s.rightPictureInTop3,
      sentWithoutAsking: s.sentWithoutAsking,
      wrongButConfident: s.wrongButConfident,
      screens: info.coverage.ui,
      checkedBy: info.coverage.review,
    };
  });
}

/** Try calibration settings: keep wrong-but-confident ≤ 2%, then send as many as possible without asking. */
function sweep(rows: Row[]) {
  const best: { floor: number; ceiling: number; decisiveMargin: number; confident: number; wrong: number }[] = [];
  for (const floor of [0.8, 0.81, 0.82, 0.83, 0.84, 0.85, 0.86])
    for (const ceiling of [0.88, 0.9, 0.92, 0.94])
      for (const decisiveMargin of [0.02, 0.03, 0.035, 0.04, 0.05, 0.06]) {
        if (ceiling <= floor) continue;
        Object.assign(SEMANTIC_CALIBRATION, { floor, ceiling, decisiveMargin });
        const s = summarize(rows, 'sweep', true).raw;
        best.push({ floor, ceiling, decisiveMargin, confident: s.confident, wrong: s.confidentWrong });
      }
  return best
    .filter((b) => b.wrong / rows.length <= 0.02)
    .sort((a, b) => b.confident - a.confident || a.wrong - b.wrong)
    .slice(0, 5);
}

async function collect(embedder: Embedder, index: Awaited<ReturnType<typeof buildNeedIndex>>, set: PhraseSet) {
  const rows: Row[] = [];
  for (const [lang, needs] of Object.entries(set) as [LangCode, Record<string, string | string[]>][]) {
    for (const [expected, phrases] of Object.entries(needs)) {
      for (const text of Array.isArray(phrases) ? phrases : [phrases]) {
        const [q] = await embedder.embed([text], 'query');
        rows.push({ lang, expected, text, kw: keyword.match(text), ranked: rankByIndex(index, q!).slice(0, 6), probs: head?.predict(q!) });
      }
    }
  }
  return rows;
}

async function textEval(embedder: Embedder) {
  console.log('\n▶ Typed requests — tuning set (144 phrases, 12 needs × 6 languages × 2; used to tune vocabulary + calibration)');
  const index = await buildNeedIndex(embedder);
  const rows = await collect(embedder, index, NEED_PHRASES);
  const saved = { ...SEMANTIC_CALIBRATION };
  const results = [summarize(rows, 'keywords only (before)', false), summarize(rows, 'keywords + e5', true), ...(head ? [summarize(rows, 'keywords + e5 + trained head (now)', true, true)] : [])];
  console.table(results.map(({ raw: _raw, ...r }) => r));
  console.log('  top-1 by language (keywords + e5):', byLanguage(rows));
  const candidates = sweep(rows);
  Object.assign(SEMANTIC_CALIBRATION, saved);
  console.log('  calibration candidates (≤2% wrong-but-confident):');
  console.table(candidates);

  const nHeld = Object.values(HELDOUT_PHRASES).reduce((n, needs) => n + Object.keys(needs ?? {}).length, 0);
  console.log(`\n▶ Typed requests — held-out set (${nHeld} phrases never used for tuning, ${Object.keys(HELDOUT_PHRASES).length} languages)`);
  const held = await collect(embedder, index, HELDOUT_PHRASES);
  const heldResults = [summarize(held, 'keywords only (before)', false), summarize(held, 'keywords + e5', true), ...(head ? [summarize(held, 'keywords + e5 + trained head (now)', true, true)] : [])];
  console.table(heldResults.map(({ raw: _raw, ...r }) => r));
  const heldByLanguage = languageTable(held);
  console.log('\n  By language (keywords + e5 + trained head). "pack" languages were added as data files:');
  console.table(heldByLanguage);
  const core = held.filter((r) => languageInfo(r.lang).core);
  const packs = held.filter((r) => !languageInfo(r.lang).core);
  if (packs.length) {
    console.table([summarize(core, 'six core languages', true, !!head), summarize(packs, 'four pack languages', true, !!head)].map(({ raw: _raw, ...r }) => r));
    console.log('  Pack-language sentences and pack vocabulary share an author, so those rows are optimistic: see the note in packages/shared/src/lab/phrases.ts.');
  }
  return { rows, results, candidates, heldOut: { rows: held, results: heldResults, byLanguage: heldByLanguage } };
}

async function crewEval(embedder: Embedder) {
  console.log('\n▶ Crew speech → verified reply (14 Japanese phrases)');
  const { ReplyMatcher } = await import('@hearme/shared');
  const m = await ReplyMatcher.create(embedder);
  let correct = 0;
  let confidentWrong = 0;
  const rows = [];
  for (const [text, expected] of CREW_PHRASES) {
    const r = await m.match(text);
    if (r.replyId === expected) correct += 1;
    else if (r.confidence >= CONFIDENCE_THRESHOLD) confidentWrong += 1;
    rows.push({ text, expected, got: r.replyId, confidence: r.confidence });
  }
  console.table(rows);
  console.log(`  correct: ${correct}/${CREW_PHRASES.length}, wrong-but-confident: ${confidentWrong}`);
  return { rows, correct, total: CREW_PHRASES.length };
}

/** Engine rumble + airflow hiss, roughly the spectrum of a cabin at cruise. */
function cabinNoise(n: number, seed = 7): Float32Array {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff) * 2 - 1;
  const out = new Float32Array(n);
  let brown = 0;
  let hiss = 0;
  for (let i = 0; i < n; i++) {
    const t = i / 16000;
    brown = (brown + 0.02 * rand()) / 1.02;
    hiss = 0.85 * hiss + 0.15 * rand();
    const hum = 0.25 * Math.sin(2 * Math.PI * 92 * t) + 0.12 * Math.sin(2 * Math.PI * 184 * t + 1);
    out[i] = 3.2 * brown + 0.35 * hiss + hum * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.7 * t));
  }
  return out;
}

function rms(x: Float32Array, voicedOnly = false): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    if (voicedOnly && Math.abs(x[i]!) < 0.01) continue;
    sum += x[i]! * x[i]!;
    n += 1;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

function mix(speech: Float32Array, snrDb: number): Float32Array {
  const pad = 8000;
  const out = new Float32Array(speech.length + 2 * pad);
  const noise = cabinNoise(out.length);
  const scale = rms(speech, true) / (rms(noise) * 10 ** (snrDb / 20));
  for (let i = 0; i < out.length; i++) {
    const v = (i >= pad && i < pad + speech.length ? speech[i - pad]! : 0) + noise[i]! * scale;
    out[i] = Math.max(-1, Math.min(1, v));
  }
  return out;
}

function synthesize(text: string, lang: LangCode, file: string): Float32Array {
  const voice = VOICES[lang];
  if (!voice) throw new Error(`no synthetic voice for ${lang}`);
  const aiff = `${file}.aiff`;
  execFileSync('say', ['-v', voice, '-o', aiff, text]);
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', aiff, '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice();
}

async function speechEval(embedder: Embedder) {
  const size = (opt('model', 'small') === 'base' ? 'base' : 'small') as AsrSize;
  const snrs = opt('snr', '20,10,5,0')
    .split(',')
    .map((x) => (x === 'clean' ? Infinity : Number(x)));
  // --set heldout speaks the held-out phrasings (never used for tuning) instead of the tuning set's first phrasing.
  const set = opt('set', 'tuning') === 'heldout' ? 'heldout' : 'tuning';
  const phrases = (set === 'heldout' ? HELDOUT_PHRASES : NEED_PHRASES) as PhraseSet;
  // --langs hi,en,ja limits the run (a quick check); default: every language with a macOS voice.
  const only = opt('langs', '').split(',').filter(Boolean);
  const spoken = (Object.keys(phrases) as LangCode[]).filter((l) => VOICES[l] && (!only.length || only.includes(l)));
  const skipped = (Object.keys(phrases) as LangCode[]).filter((l) => !VOICES[l]);
  console.log(`\n▶ Synthetic speech (${set} set) → Whisper-${size} → keywords + e5 + head (one phrasing per need, conditions: clean, ${snrs.join(', ')} dB SNR)`);
  if (skipped.length) {
    console.log(`  Skipped (macOS has no \`say\` voice): ${skipped.map((l) => languageInfo(l).englishName).join(', ')}. Their spoken accuracy is unmeasured here — use the voice lab with real speakers.`);
  }
  // Model start-up cost, measured rather than claimed.
  const beforeRss = process.memoryUsage().rss;
  const loadStart = Date.now();
  const asr = await createWhisper(size, threads);
  const asrLoadMs = Date.now() - loadStart;
  const engine = new AiEngine({ asrSize: size, threads, loadEmbedder: async () => embedder, loadAsr: async () => asr });
  const warmStart = Date.now();
  await engine.start();
  const startup = {
    asrLoadMs,
    warmupMs: Date.now() - warmStart,
    asrWarmupMs: engine.status.asr.warmupMs ?? null,
    embedWarmupMs: engine.status.embed.warmupMs ?? null,
    rssAfterMb: Math.round(process.memoryUsage().rss / 1e6),
    rssAddedByAsrMb: Math.round((process.memoryUsage().rss - beforeRss) / 1e6),
  };
  console.log('  Start-up and memory on this machine:');
  console.table([startup]);
  const dir = join(OUT, 'speech');
  mkdirSync(dir, { recursive: true });
  const conditions = [Infinity, ...snrs.filter((x) => Number.isFinite(x))];
  const rows: { lang: LangCode; expected: string; snr: number; said: string; transcript: string; got?: string; confidence: number; asrMs: number; matchMs: number }[] = [];
  for (const lang of spoken) {
    const needs = phrases[lang]!;
    for (const [expected, p] of Object.entries(needs)) {
      const text = [p].flat()[0]!;
      const clean = synthesize(text, lang, join(dir, `${set}-${lang}-${expected}`));
      for (const snr of conditions) {
        const noisy = Number.isFinite(snr) ? mix(clean, snr) : clean;
        const hp = Number(opt('hp', String(HIGH_PASS_HZ)));
        const audio = highPass(flag('denoise') ? denoise(noisy) : noisy, hp);
        const t0 = Date.now();
        const transcript = hasSpeech(audio) ? await asr.transcribe(audio, lang) : '';
        const asrMs = Date.now() - t0;
        const t1 = Date.now();
        const match = await engine.matchNeeds(transcript);
        rows.push({ lang, expected, snr, said: text, transcript, got: match.candidates[0]?.needId, confidence: match.confidence, asrMs, matchMs: Date.now() - t1 });
        process.stdout.write('.');
      }
    }
  }
  console.log();
  const percentile = (xs: number[], q: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1))]! : null);
  const summarizeSpeech = (r: typeof rows, label: string) => {
    const correct = r.filter((x) => x.got === x.expected).length;
    const confident = r.filter((x) => x.confidence >= CONFIDENCE_THRESHOLD);
    const wrongConfident = confident.filter((x) => x.got !== x.expected).length;
    const total = r.map((x) => x.asrMs + x.matchMs).sort((a, b) => a - b);
    return {
      condition: label,
      n: r.length,
      // How wrong Whisper's text was, before any matching: separates a speech problem from a matching problem.
      wordErrorRate: fmtRate(aggregateErrorRate(r.map((x) => ({ reference: x.said, transcript: x.transcript, lang: x.lang })))),
      heardNothing: pct(r.filter((x) => !x.transcript.trim()).length, r.length),
      top1: pct(correct, r.length),
      sentWithoutAsking: pct(confident.length, r.length),
      wrongButConfident: pct(wrongConfident, r.length),
      medianMs: percentile(total, 0.5),
      p95Ms: percentile(total, 0.95),
    };
  };
  const table = conditions.map((snr) => summarizeSpeech(rows.filter((x) => x.snr === snr), Number.isFinite(snr) ? `${snr} dB SNR` : 'clean'));
  console.table(table);

  console.log('\n  By language (all conditions together):');
  console.table(spoken.map((l) => summarizeSpeech(rows.filter((x) => x.lang === l), languageInfo(l).englishName)));

  console.log('\n  Quiet vs noisy:');
  const quiet = rows.filter((x) => !Number.isFinite(x.snr) || x.snr >= 20);
  const noisy = rows.filter((x) => Number.isFinite(x.snr) && x.snr <= 10);
  console.table([summarizeSpeech(quiet, 'quiet (clean + ≥20 dB)'), summarizeSpeech(noisy, 'noisy (≤10 dB)')].filter((r) => r.n > 0));

  return { model: size, set, rows, table, startup, byLanguage: spoken.map((l) => summarizeSpeech(rows.filter((x) => x.lang === l), languageInfo(l).englishName)), skipped };
}

const embedder = await createE5(threads);
const text = await textEval(embedder);
const crew = await crewEval(embedder);
const speech = flag('speech') ? await speechEval(embedder) : null;
const previous = (() => {
  try {
    return JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8'));
  } catch {
    return {};
  }
})();
const heldOutSpeech = speech?.set === 'heldout';
if (heldOutSpeech) writeFileSync(join(OUT, `results-${speech.model}-heldout${flag('denoise') ? '-denoise' : ''}${Number(opt('hp', String(HIGH_PASS_HZ))) > 0 ? `-hp${opt('hp', String(HIGH_PASS_HZ))}` : ''}.json`), JSON.stringify({ at: new Date().toISOString(), speech }, null, 2));
writeFileSync(
  join(OUT, 'results.json'),
  JSON.stringify({ ...previous, at: new Date().toISOString(), calibration: SEMANTIC_CALIBRATION, text, crew, ...(speech && !heldOutSpeech ? { speech } : {}) }, null, 2),
);
console.log(`\nSaved ${join(OUT, 'results.json')}`);
