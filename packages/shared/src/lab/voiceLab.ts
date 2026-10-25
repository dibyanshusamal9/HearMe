import type { UnderstandResult } from '../cabin/hubClient';
import { getNeed } from '../catalog/needs';
import { REPLIES, REPLY_SUGGEST_MIN, getReply } from '../catalog/replies';
import { decide } from '../matching/matcher';
import type { LangCode, ReplyId } from '../types';
import { CREW_PHRASES, HELDOUT_PHRASES } from './phrases';
import { aggregateErrorRate, type ErrorRate } from './wer';

export { CREW_PHRASES, HELDOUT_PHRASES } from './phrases';
export * from './wer';

/**
 * Voice lab: teammates speak into a real microphone, the hub runs the real
 * pipeline (Whisper, then matching) and logs what a passenger or crew member
 * would have seen. Shared by the lab page (#/lab), the hub (which scores and
 * logs every take) and `npm run lab-report`, so all three count the same way.
 */

/** A passenger asking for something, or crew replying in Japanese. */
export type LabSpeaker = 'passenger' | 'crew';
/** Read a given sentence, or ask in your own words (closer to real use, and harder). */
export type LabMode = 'read' | 'own-words';
export type LabPlace = 'quiet' | 'cabin-noise' | 'noisy-room';
export type LabMic = 'laptop' | 'phone' | 'headset' | 'other';

export const LAB_PLACES: Record<LabPlace, string> = { quiet: 'Quiet room', 'cabin-noise': 'Cabin noise playing', 'noisy-room': 'Noisy room' };
export const LAB_MICS: Record<LabMic, string> = { laptop: 'Laptop mic', phone: 'Phone', headset: 'Headset', other: 'Other mic' };
export const LAB_MODES: Record<LabMode, string> = { read: 'Read the sentence', 'own-words': 'Own words' };

/**
 * What the person would have seen on the real screen:
 *  right    passenger: the right picture, ready to send · crew: the right verified reply suggested
 *  offered  passenger: "Did you mean…?" with the right picture among those offered
 *  missed   passenger: asked, without the right picture (they pick from all pictures or type) · crew: nothing suggested, they tap a reply
 *  wrong    passenger: the wrong picture, ready to send (they have to notice) · crew: a wrong reply suggested (crew confirm before sending)
 *  silent   Whisper heard nothing
 */
export type LabOutcome = 'right' | 'offered' | 'missed' | 'wrong' | 'silent';
export const LAB_OUTCOMES: LabOutcome[] = ['right', 'offered', 'missed', 'wrong', 'silent'];
export const OUTCOME_LABEL: Record<LabOutcome, string> = {
  right: 'Right first time',
  offered: 'Right after “Did you mean…?”',
  missed: 'Missed',
  wrong: 'Wrong one shown',
  silent: 'Nothing heard',
};

export interface LabPrompt {
  /** The need (passenger) or verified reply (crew) this should be understood as. */
  expected: string;
  /** Read mode: the sentence to read aloud. Own words: '' (the page shows the picture or meaning). */
  text: string;
  /** Sharda's sentence from the stage story: a good take can become the story's recording. */
  story?: boolean;
}

/** The stage story's sentence ("I need hot water for my medicine"). */
export const STORY_SENTENCES: Partial<Record<LangCode, { text: string; expected: string }>> = {
  hi: { text: 'मुझे दवाई के लिए गरम पानी चाहिए', expected: 'hot_water' },
};

/** Crew speak Japanese, as on the crew console. `lang`: one of the 6 languages or a language pack's code. */
export const labLanguage = (speaker: LabSpeaker, lang: string): string => (speaker === 'crew' ? 'ja' : lang);

/**
 * Languages a tester can be given a sentence to read aloud. Every language
 * HearMe offers now has a held-out set, pack languages included, so the lab
 * can compare Punjabi against Hindi on the same twelve needs instead of
 * limiting pack languages to own-words takes.
 */
export const hasReadPrompts = (lang: string): lang is LangCode => HELDOUT_PHRASES[lang as LangCode] !== undefined;

/** @deprecated Reads as "is one of the original six"; use `hasReadPrompts` for prompt choice. */
export const isBuiltInLang = hasReadPrompts;

/** One round of prompts. Reading uses the held-out phrases that never tuned the matcher. */
export function labPrompts(speaker: LabSpeaker, mode: LabMode, lang: string): LabPrompt[] {
  if (speaker === 'crew') {
    return mode === 'read' ? CREW_PHRASES.map(([text, expected]) => ({ expected, text })) : REPLIES.map((r) => ({ expected: r.id, text: '' }));
  }
  if (!hasReadPrompts(lang) || mode === 'own-words') return Object.keys(HELDOUT_PHRASES.en!).map((expected) => ({ expected, text: '' }));
  const prompts: LabPrompt[] = Object.entries(HELDOUT_PHRASES[lang]!).map(([expected, text]) => ({ expected, text }));
  const story = STORY_SENTENCES[lang];
  if (story) prompts.push({ ...story, story: true });
  return prompts;
}

/** English name of what was expected or picked. */
export function labItemLabel(speaker: LabSpeaker, id: string | null): string {
  if (!id) return '—';
  if (speaker === 'crew') return REPLIES.some((r) => r.id === id) ? getReply(id as ReplyId).text.en : id;
  return getNeed(id)?.label.en ?? id;
}

export interface LabScore {
  outcome: LabOutcome;
  /** What came first (need or reply id), if anything. */
  got: string | null;
  confidence: number;
  /** Passenger, when asked "Did you mean…?": the pictures offered. */
  options: string[];
}

/** Score one take the way the apps would have acted on it. */
export function scoreTake(speaker: LabSpeaker, expected: string, r: Pick<UnderstandResult, 'transcript' | 'match' | 'reply'>): LabScore {
  if (!r.transcript.trim()) return { outcome: 'silent', got: null, confidence: 0, options: [] };
  if (speaker === 'crew') {
    const got = r.reply?.replyId ?? null;
    const confidence = r.reply?.confidence ?? 0;
    const outcome: LabOutcome = !got || confidence < REPLY_SUGGEST_MIN ? 'missed' : got === expected ? 'right' : 'wrong';
    return { outcome, got, confidence, options: [] };
  }
  const match = r.match ?? { candidates: [], confidence: 0 };
  const d = decide(match);
  if (d.kind === 'confident') return { outcome: d.needId === expected ? 'right' : 'wrong', got: d.needId, confidence: d.confidence, options: [] };
  return { outcome: d.options.includes(expected) ? 'offered' : 'missed', got: match.candidates[0]?.needId ?? null, confidence: match.confidence, options: d.options };
}

/** What the lab page sends with each recording. */
export interface LabTakeInfo {
  /** One sitting: the same person, place and microphone. */
  session: string;
  /** Initials or a nickname; optional, never a full name. */
  tester: string;
  speaker: LabSpeaker;
  /** One of the 6 languages, or a language pack's code (e.g. "bn"). */
  lang: string;
  /** Is this the speaker's first language? */
  firstLanguage: boolean;
  place: LabPlace;
  mic: LabMic;
  mode: LabMode;
  expected: string;
  /** The sentence read aloud ('' in own-words mode). */
  prompt: string;
  /** Keep the recording on the hub laptop (off unless the speaker ticks it). */
  keepAudio: boolean;
}

/** One take as logged by the hub: one JSON line in apps/hub/.lab/takes.jsonl. */
export interface LabTake extends Omit<LabTakeInfo, 'keepAudio'>, LabScore {
  id: string;
  /** ISO time. */
  at: string;
  /** Length of the recording, seconds. */
  seconds: number;
  transcript: string;
  /** Whisper, matching, and everything on the hub from upload to answer (decode, queue, Whisper, matching), ms. */
  asrMs: number;
  matchMs: number;
  hubMs: number;
  /** The Whisper model that heard it. */
  model: string;
  /** File in .lab/audio when the speaker chose to keep recordings. */
  audio?: string;
}

const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | null => (allowed.includes(v as T) ? (v as T) : null);

export function labTakeQuery(info: LabTakeInfo): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(info)) q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  return q.toString();
}

/**
 * Check what a lab page sent; returns the take info or what is wrong with it.
 * `packLangs`: language packs the hub can hear (passengers, own words only).
 */
export function parseLabTakeQuery(q: URLSearchParams, packLangs: readonly string[] = []): LabTakeInfo | string {
  const speaker = pick(q.get('speaker'), ['passenger', 'crew'] as const);
  const lang = pick(q.get('lang'), [...(Object.keys(HELDOUT_PHRASES) as LangCode[]), ...packLangs]);
  const place = pick(q.get('place'), Object.keys(LAB_PLACES) as LabPlace[]);
  const mic = pick(q.get('mic'), Object.keys(LAB_MICS) as LabMic[]);
  const mode = pick(q.get('mode'), Object.keys(LAB_MODES) as LabMode[]);
  if (!speaker || !lang || !place || !mic || !mode) return 'speaker, lang, place, mic and mode are required';
  if (speaker === 'crew' && lang !== 'ja') return 'crew speak Japanese';
  if (!hasReadPrompts(lang) && mode !== 'own-words') return 'no sentences to read in this language yet: use own words';
  const session = q.get('session') ?? '';
  if (!/^[a-z0-9-]{4,40}$/i.test(session)) return 'bad session id';
  const expected = q.get('expected') ?? '';
  const known = speaker === 'crew' ? REPLIES.some((r) => r.id === expected) : !!getNeed(expected);
  if (!known) return `unknown ${speaker === 'crew' ? 'reply' : 'need'}: ${expected}`;
  const tester = (q.get('tester') ?? '').trim().slice(0, 40);
  const prompt = (q.get('prompt') ?? '').slice(0, 300);
  return { session, tester, speaker, lang, firstLanguage: q.get('firstLanguage') === '1', place, mic, mode, expected, prompt, keepAudio: q.get('keepAudio') === '1' };
}

export interface LabSummary {
  label: string;
  takes: number;
  counts: Record<LabOutcome, number>;
  /** Time on the hub, ms: median, 90th and 95th percentile. */
  medianMs: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  /**
   * Speech-to-text error rate over the takes that read a given sentence
   * (own-words takes have no reference text, so they are left out). Null when
   * no take in the group had a reference.
   */
  wer: ErrorRate | null;
  /** Takes the error rate was computed from. */
  werTakes: number;
  /**
   * Share of takes where the passenger did not get a ready-to-send request:
   * asked without the right picture, or nothing heard. The number that says
   * how often someone has to fall back to tapping or typing.
   */
  fallbackRate: number;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}

export function summarizeTakes(takes: LabTake[], label = 'All takes'): LabSummary {
  const counts = Object.fromEntries(LAB_OUTCOMES.map((o) => [o, 0])) as Record<LabOutcome, number>;
  for (const t of takes) counts[t.outcome] += 1;
  const times = takes.filter((t) => t.outcome !== 'silent').map((t) => t.hubMs).sort((a, b) => a - b);
  const withReference = takes.filter((t) => t.mode === 'read' && t.prompt.trim());
  return {
    label,
    takes: takes.length,
    counts,
    medianMs: percentile(times, 0.5),
    p90Ms: percentile(times, 0.9),
    p95Ms: percentile(times, 0.95),
    wer: aggregateErrorRate(withReference.map((t) => ({ reference: t.prompt, transcript: t.transcript, lang: labLanguage(t.speaker, t.lang) }))),
    werTakes: withReference.length,
    fallbackRate: takes.length ? (counts.missed + counts.silent) / takes.length : 0,
  };
}

/** One summary row per group (language, place, mic…), biggest first. */
export function summarizeBy(takes: LabTake[], key: (t: LabTake) => string): LabSummary[] {
  const groups = new Map<string, LabTake[]>();
  for (const t of takes) groups.set(key(t), [...(groups.get(key(t)) ?? []), t]);
  return [...groups].map(([label, ts]) => summarizeTakes(ts, label)).sort((a, b) => b.takes - a.takes || a.label.localeCompare(b.label));
}

export const pct = (n: number, d: number): string => (d ? `${Math.round((100 * n) / d)}%` : '—');
export const fmtSeconds = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);

const CSV_COLUMNS = [
  'at', 'session', 'tester', 'speaker', 'lang', 'firstLanguage', 'place', 'mic', 'mode', 'expected', 'prompt', 'seconds', 'transcript',
  'outcome', 'got', 'confidence', 'options', 'asrMs', 'matchMs', 'hubMs', 'model', 'audio', 'id',
] as const satisfies readonly (keyof LabTake)[];

/** Spreadsheet-safe CSV (text that starts like a formula is quoted as text). */
export function takesToCsv(takes: LabTake[]): string {
  const cell = (v: unknown) => {
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    let s = Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLUMNS.join(','), ...takes.map((t) => CSV_COLUMNS.map((c) => cell(t[c])).join(','))].join('\r\n') + '\r\n';
}
