import { NEEDS, PURPOSE_PHRASES } from '../catalog/needs';
import type { Need, NeedPurpose } from '../types';
import { allowedEdits, fuzzyFind, soundAlike } from './phonetic';

/**
 * Intent matcher: turns a transcript (or typed text) into one of the known needs.
 *
 * The PDF's production design is Whisper (speech → text) followed by
 * multilingual-e5 embeddings that match the text to 1 of 64 needs, asking with
 * pictures when confidence < 85%. This module is a deterministic, offline
 * keyword matcher standing in for the embedding model. It keeps the same
 * contract (ranked candidates + confidence) so the real model can replace it
 * behind `IntentMatcher`.
 */

export const CONFIDENCE_THRESHOLD = 0.85;

export interface MatchCandidate {
  needId: string;
  score: number;
}

/**
 * *Why* the matcher landed on its top candidate. The confidence number says
 * how sure; this says on what grounds, which is what the passenger is actually
 * shown when HearMe has to ask. It is read off the matching that really
 * happened — not a second guess at a probability.
 *
 *  exact_words  the transcript contains a catalogue phrase outright
 *  sounds_like  no exact phrase; it matched by how it sounds (a mis-transcription)
 *  meaning      the embedding model recognised the request without any known word
 *  both_agree   the words and the meaning model picked the same need
 *  disagree     they picked different needs — the honest reason to ask rather than send
 *  weak_hint    only a supporting word ("cold", "thirsty"), not the thing itself
 *  nothing      nothing matched
 */
export type MatchEvidence = 'exact_words' | 'sounds_like' | 'meaning' | 'both_agree' | 'disagree' | 'weak_hint' | 'nothing';

export interface MatchResult {
  /** Ranked candidates, best first. May be empty. */
  candidates: MatchCandidate[];
  /** 0..1. At or above CONFIDENCE_THRESHOLD the top candidate can be used directly. */
  confidence: number;
  purposeId?: NeedPurpose['id'];
  /** On what grounds the top candidate was chosen. */
  evidence?: MatchEvidence;
  /** The catalogue word that was recognised, when one was: shown back to the passenger. */
  matchedWord?: string;
}

export interface IntentMatcher {
  match(text: string): MatchResult;
}

/** Lower-case, strip Latin diacritics (keeps Devanagari/Thai marks), turn punctuation into spaces. */
export function normalize(text: string): string {
  return (
    ' ' +
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .normalize('NFC')
      // Malayalam chillu letters typed the old way (ന്‍) are one letter (ൻ); then the joiners
      // that only change how Indian scripts draw a conjunct (ഹെഡ്‌ഫോൺ, హెడ్‌ఫోన్) are dropped.
      .replace(/([ണനരലളക])\u0D4D\u200D/g, (_, c: string) => MALAYALAM_CHILLU[c]!)
      .replace(/[\u200C\u200D]/g, '')
      .replace(/[.,!?;:"'“”‘’()[\]{}…、。！？「」·\-–—/\\]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() +
    ' '
  );
}

const MALAYALAM_CHILLU: Record<string, string> = { ണ: 'ൺ', ന: 'ൻ', ര: 'ർ', ല: 'ൽ', ള: 'ൾ', ക: 'ൿ' };

const LATIN_ONLY = /^[a-z0-9 ]+$/;

interface Span {
  start: number;
  end: number;
}

interface Hit extends Span {
  kind: 'phrase' | 'hint' | 'purpose';
  needId?: string;
  purposeId?: NeedPurpose['id'];
}

function findSpans(text: string, keyword: string): Span[] {
  const kw = normalize(keyword).trim();
  if (!kw) return [];
  // Latin keywords must match whole words; other scripts have no word spaces.
  const needle = LATIN_ONLY.test(kw) ? ` ${kw} ` : kw;
  const spans: Span[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) break;
    const start = LATIN_ONLY.test(kw) ? at + 1 : at;
    spans.push({ start, end: start + kw.length });
    from = at + 1;
  }
  return spans;
}

function allKeywords(map: Partial<Record<string, string[]>> | undefined): string[] {
  return map ? Object.values(map).flatMap((v) => v ?? []) : [];
}

/**
 * Words that contain or fold into a need's keyword without meaning it:
 * Vietnamese "ở đâu" (where) is not "đau" (pain); Thai has no spaces, and
 * "อยาก" (want) contains "ยา" (medicine). Drop them before matching.
 */
function dropFalseFriends(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFC')
      .replace(/đâu/g, ' ')
      // Whisper hears Thai "ขอยา" (may I have medicine) as "ขออยาก", and "ชาร์จ" (charge) as "ชาติ" (nation).
      .replace(/ขออยาก/g, 'ขอยา')
      .replace(/ชาติ/g, 'ชาร์จ')
      .replace(/อ?ยาก/g, ' ')
      // "want" that starts with "tea": Punjabi ਚਾਹੀਦਾ (ਚਾਹ), Bengali চাই (চা), Hinglish chaiye (chai).
      .replace(/ਚਾਹੀਦ\S*|ਚਾਹੁੰਦ\S*/gu, ' ')
      .replace(/(?<=^|\s)চাই\S*/gu, ' ')
      .replace(/\bchai(?:ye|ie|yee)\b/g, ' ')
      // "ચા"/"ଚା" (tea) starts other words: Gujarati ચાલે (works), ચાર (four), ચાવી (key);
      // Odia ଚାହିଁ (want), ଚାଲୁ (works), ଚାରି (four), ଚାବି (key). ચાર્જ / ଚାର୍ଜ (charge) stays.
      .replace(/ચા(?=લ|વ|ર(?!્)|ટ)/gu, 'ચ')
      .replace(/ଚା(?=ହ|ଲ|ର(?!୍)|ବ)/gu, 'ଚ')
  );
}

/** Languages whose speech transcripts get the sound-alike tier (English and Indonesian come out of Whisper clean). */
/** English and Indonesian come out of Whisper clean; every other language (and language pack) gets the sound-alike tier. */
const CLEAN_LANGS = new Set(['en', 'id']);

interface AlikeKeyword {
  needId: string;
  kind: 'phrase' | 'hint';
  lang: string;
  /** Normalized spelling, and the same folded to how it sounds. */
  plain: string;
  keyword: string;
  edits: number;
}

function alikeKeywords(needs: Need[]): AlikeKeyword[] {
  const out: AlikeKeyword[] = [];
  for (const need of needs) {
    for (const kind of ['phrase', 'hint'] as const) {
      const map = kind === 'phrase' ? need.phrases : need.hints;
      for (const [lang, words] of Object.entries(map ?? {}) as [string, string[] | undefined][]) {
        if (CLEAN_LANGS.has(lang)) continue;
        for (const w of words ?? []) {
          const plain = normalize(w).trim();
          const keyword = soundAlike(plain, lang);
          const edits = allowedEdits(keyword, lang);
          if (keyword && edits >= 0) out.push({ needId: need.id, kind, lang, plain, keyword, edits });
        }
      }
    }
  }
  return out;
}

export function createKeywordMatcher(needs: Need[] = NEEDS): IntentMatcher {
  const alike = alikeKeywords(needs);
  return {
    match(input: string): MatchResult {
      const text = normalize(dropFalseFriends(input));
      if (!text.trim()) return { candidates: [], confidence: 0, evidence: 'nothing' };

      const hits: Hit[] = [];
      for (const [purposeId, words] of Object.entries(PURPOSE_PHRASES) as [NeedPurpose['id'], string[]][]) {
        for (const w of words) for (const s of findSpans(text, w)) hits.push({ ...s, kind: 'purpose', purposeId });
      }
      for (const need of needs) {
        for (const w of allKeywords(need.phrases)) for (const s of findSpans(text, w)) hits.push({ ...s, kind: 'phrase', needId: need.id });
        for (const w of allKeywords(need.hints)) for (const s of findSpans(text, w)) hits.push({ ...s, kind: 'hint', needId: need.id });
      }

      // A hit fully inside a longer hit is part of that longer phrase
      // ("गरम पानी" is hot water, not water; "दवाई के लिए" is a purpose, not the medicine need;
      // the hint "lanh" inside the phrase "lanh qua" must not count twice).
      const kept = hits.filter(
        (h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start),
      );

      // Sound-alike tier: what the exact keywords did not explain, spelled the way it sounds.
      const exactNeeds = new Set(kept.filter((h) => h.kind === 'phrase').map((h) => h.needId!));
      const masked = text.split('');
      for (const h of kept) for (let i = h.start; i < h.end; i++) masked[i] = ' ';
      const rest = masked.join('');
      const alikeText = new Map<string, string>();
      type AlikeHit = AlikeKeyword & { start: number; end: number; found: number };
      const alikeHits: AlikeHit[] = [];
      for (const k of alike) {
        if (k.kind === 'phrase' && exactNeeds.has(k.needId)) continue;
        let t = alikeText.get(k.lang);
        if (t === undefined) alikeText.set(k.lang, (t = soundAlike(rest, k.lang)));
        const hit = fuzzyFind(t, k.keyword, k.edits, k.lang !== 'th' && k.lang !== 'ja');
        if (hit) alikeHits.push({ ...k, start: hit.start, end: hit.end, found: hit.edits });
      }

      // A longer phrase heard by sound explains the exact keyword inside it:
      // Whisper's "गरन पानी" is hot water (गरम पानी), not water (पानी).
      const explained = new Set<Hit>();
      const extensions: AlikeHit[] = [];
      for (const e of kept) {
        if (e.kind !== 'phrase') continue;
        const word = text.slice(e.start, e.end);
        for (const k of alike) {
          if (k.kind !== 'phrase' || k.needId === e.needId || k.plain.length <= word.length || !k.plain.includes(word)) continue;
          const around = soundAlike(text.slice(Math.max(0, e.start - k.plain.length - 2), e.end + k.plain.length + 2), k.lang);
          const hit = fuzzyFind(around, k.keyword, k.edits, k.lang !== 'th' && k.lang !== 'ja');
          if (hit && hit.edits > 0) {
            explained.add(e);
            extensions.push({ ...k, start: -1, end: -1, found: hit.edits });
          }
        }
      }
      const exact = kept.filter((h) => !explained.has(h));

      const alikeBest = new Map<string, number>();
      for (const h of alikeHits) {
        // As above, but a hint ("cold") still supports its need inside another need's phrase ("so cold").
        const inside = (o: AlikeHit) => o !== h && o.lang === h.lang && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start;
        if (alikeHits.some((o) => inside(o) && (h.kind === 'phrase' || o.needId === h.needId))) continue;
        const key = `${h.needId}:${h.kind}`;
        alikeBest.set(key, Math.max(alikeBest.get(key) ?? 0, h.kind === 'phrase' ? 0.8 - 0.1 * h.found : 0.25));
      }
      for (const h of extensions) {
        const key = `${h.needId}:phrase`;
        alikeBest.set(key, Math.max(alikeBest.get(key) ?? 0, 0.8 - 0.1 * h.found));
      }

      const scores = new Map<string, number>();
      const seen = new Set<string>();
      for (const h of exact) {
        if (!h.needId) continue;
        const key = `${h.needId}:${h.start}:${h.end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const add = h.kind === 'phrase' ? 1 : 0.35;
        scores.set(h.needId, Math.min(1.5, (scores.get(h.needId) ?? 0) + add));
      }
      for (const [key, w] of alikeBest) {
        const needId = key.slice(0, key.lastIndexOf(':'));
        scores.set(needId, Math.min(1.5, (scores.get(needId) ?? 0) + w));
      }

      const purposeHits = kept.filter((h) => h.kind === 'purpose');
      const candidates = [...scores.entries()]
        .map(([needId, score]) => ({ needId, score }))
        .sort((a, b) => b.score - a.score || needOrder(a.needId) - needOrder(b.needId));

      const top = candidates[0];
      let confidence = 0;
      let evidence: MatchEvidence = 'nothing';
      let matchedWord: string | undefined;
      if (top) {
        const second = candidates[1]?.score ?? 0;
        const strength = Math.min(1, top.score);
        const margin = (top.score - second) / top.score;
        confidence = Math.min(0.99, 0.6 * strength + 0.4 * margin);
        const named = exact.find((h) => h.needId === top.needId && h.kind === 'phrase');
        const hinted = exact.find((h) => h.needId === top.needId && h.kind === 'hint');
        const heard = alikeHits.find((h) => h.needId === top.needId) ?? extensions.find((h) => h.needId === top.needId);
        if (named) {
          evidence = 'exact_words';
          matchedWord = text.slice(named.start, named.end).trim();
        } else if (heard) {
          evidence = 'sounds_like';
          matchedWord = heard.plain;
        } else if (hinted) {
          evidence = 'weak_hint';
          matchedWord = text.slice(hinted.start, hinted.end).trim();
        }
        // Heard only by sound: show pictures rather than send.
        if (!exact.some((h) => h.needId === top.needId)) confidence = Math.min(confidence, 0.8);
      }

      let purposeId: NeedPurpose['id'] | undefined;
      if (top) {
        const need = needs.find((n) => n.id === top.needId);
        purposeId = purposeHits.map((h) => h.purposeId!).find((p) => need?.purposes?.includes(p));
      }

      return { candidates, confidence: round(confidence), purposeId, evidence, ...(matchedWord ? { matchedWord } : {}) };
    },
  };
}

function needOrder(id: string): number {
  const i = NEEDS.findIndex((n) => n.id === id);
  return i === -1 ? 999 : i;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Decide what the UI should do with a match result.
 *  confident – go straight to the confirm/send step for the top need
 *  ask       – "Did you mean this?" with up to 3 picture options
 */
export type MatchDecision =
  | { kind: 'confident'; needId: string; purposeId?: NeedPurpose['id']; confidence: number; evidence?: MatchEvidence; matchedWord?: string }
  | { kind: 'ask'; options: string[]; purposeId?: NeedPurpose['id']; confidence: number; evidence?: MatchEvidence; matchedWord?: string };

/** Fallback options when nothing matched: the most common things people ask for. */
export const FALLBACK_OPTIONS = ['water', 'toilet', 'blanket'];

export function decide(result: MatchResult, threshold = CONFIDENCE_THRESHOLD): MatchDecision {
  const grounds = { evidence: result.evidence, ...(result.matchedWord ? { matchedWord: result.matchedWord } : {}) };
  const top = result.candidates[0];
  if (top && result.confidence >= threshold) {
    return { kind: 'confident', needId: top.needId, purposeId: result.purposeId, confidence: result.confidence, ...grounds };
  }
  const options = result.candidates.slice(0, 3).map((c) => c.needId);
  for (const f of FALLBACK_OPTIONS) if (options.length < 3 && !options.includes(f)) options.push(f);
  return { kind: 'ask', options, purposeId: result.purposeId, confidence: result.confidence, ...grounds };
}

/**
 * The interface string that explains an uncertain match to the passenger.
 * Each one describes the matching that actually happened, so the passenger is
 * told why they are being asked rather than shown a bare percentage.
 */
export function evidenceStringKey(evidence: MatchEvidence | undefined): 'ask.exactWords' | 'ask.soundsLike' | 'ask.meaning' | 'ask.disagree' | 'ask.weakHint' | 'ask.nothing' {
  switch (evidence) {
    case 'exact_words':
    case 'both_agree':
      return 'ask.exactWords';
    case 'sounds_like':
      return 'ask.soundsLike';
    case 'meaning':
      return 'ask.meaning';
    case 'disagree':
      return 'ask.disagree';
    case 'weak_hint':
      return 'ask.weakHint';
    default:
      return 'ask.nothing';
  }
}

export const defaultMatcher = createKeywordMatcher();
