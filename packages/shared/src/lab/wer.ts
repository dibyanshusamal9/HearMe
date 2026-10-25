import type { LangCode } from '../types';

/**
 * How wrong the speech-to-text was, as a number.
 *
 * Everything else HearMe measures is about the *end* of the pipeline — did the
 * right picture appear. That hides where a failure came from: a request can be
 * understood from a badly mangled transcript (the sound-alike tier does that
 * on purpose), and a clean transcript can still be matched to the wrong need.
 * Word error rate separates the two, so "Thai is weak in noise" can be shown
 * to be a Whisper problem rather than a matching problem, or the reverse.
 *
 * Only meaningful where the reference text is known: the synthetic-speech
 * evaluation, and voice-lab takes where the tester was reading a given
 * sentence. Own-words takes have no reference and are excluded.
 */

/** Languages written without spaces between words: scored per character instead. */
const NO_WORD_SPACES: LangCode[] = ['ja', 'th'];

/** Lower-case, drop punctuation, collapse whitespace. Keeps Indic and Thai marks. */
export function normalizeForWer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'“”‘’()[\]{}…、。！？「」·\-–—/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string, lang: string): string[] {
  const clean = normalizeForWer(text);
  if (!clean) return [];
  if (NO_WORD_SPACES.includes(lang as LangCode)) return [...clean.replace(/\s/g, '')];
  return clean.split(' ');
}

/** Levenshtein distance between two token sequences (substitutions + insertions + deletions). */
export function editDistance(a: readonly string[], b: readonly string[]): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export interface ErrorRate {
  /** Edits needed to turn the transcript into the reference. */
  edits: number;
  /** Tokens in the reference (words, or characters for Japanese and Thai). */
  reference: number;
  /** edits / reference, not capped: a transcript longer than the reference can exceed 1. */
  rate: number;
  /** 'word' for space-separated languages, 'character' for Japanese and Thai. */
  unit: 'word' | 'character';
}

/** Error rate of one transcript against the sentence that was actually said. */
export function errorRate(reference: string, transcript: string, lang: string): ErrorRate {
  const unit: ErrorRate['unit'] = NO_WORD_SPACES.includes(lang as LangCode) ? 'character' : 'word';
  const ref = tokenize(reference, lang);
  const hyp = tokenize(transcript, lang);
  const edits = editDistance(ref, hyp);
  return { edits, reference: ref.length, rate: ref.length ? edits / ref.length : hyp.length ? 1 : 0, unit };
}

/**
 * Error rate over many takes. Summed as total edits ÷ total reference tokens
 * (the standard micro-average), not the mean of each take's rate — a mean
 * would let one short sentence with two mistakes outweigh a long correct one.
 */
export function aggregateErrorRate(items: { reference: string; transcript: string; lang: string }[]): ErrorRate | null {
  const scored = items.filter((i) => i.reference.trim());
  if (!scored.length) return null;
  let edits = 0;
  let reference = 0;
  const units = new Set<ErrorRate['unit']>();
  for (const i of scored) {
    const r = errorRate(i.reference, i.transcript, i.lang);
    edits += r.edits;
    reference += r.reference;
    units.add(r.unit);
  }
  return { edits, reference, rate: reference ? edits / reference : 0, unit: units.size === 1 ? [...units][0]! : 'word' };
}

export const fmtRate = (r: ErrorRate | null): string => (r === null ? '—' : `${Math.round(r.rate * 100)}%`);
