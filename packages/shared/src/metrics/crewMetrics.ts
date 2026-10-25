import type { CrewRequest } from '../cabin/crewTablet';
import type { LangCode } from '../types';

/**
 * Live numbers for the crew console, matching "What we'll measure" in the
 * idea deck: how fast help comes, how often people are understood the first
 * time, and how often the picture fallback was needed. Computed from the
 * request list only (no audio, no names).
 */
export interface CrewMetrics {
  total: number;
  /** Not yet answered and not cancelled. */
  open: number;
  answered: number;
  /** Time from the request reaching the crew tablet to the first crew reply. */
  medianAnswerMs: number | null;
  /** Spoken or typed requests (the ones that went through understanding). */
  spokenOrTyped: number;
  /** Share of spoken/typed requests understood without the picture fallback. */
  firstTimeRate: number | null;
  /** Share of spoken/typed requests that needed "Did you mean?" pictures. */
  pictureRate: number | null;
  medical: number;
  byLang: Partial<Record<LangCode, number>>;
  /** Age of the oldest unanswered request. */
  oldestOpenMs: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export function computeCrewMetrics(requests: CrewRequest[], now = Date.now()): CrewMetrics {
  const answerTimes: number[] = [];
  const byLang: Partial<Record<LangCode, number>> = {};
  let open = 0;
  let spokenOrTyped = 0;
  let viaPictures = 0;
  let medical = 0;
  let oldestOpen: number | null = null;

  for (const r of requests) {
    byLang[r.lang] = (byLang[r.lang] ?? 0) + 1;
    if (r.medical) medical += 1;
    if (r.reply) answerTimes.push(Math.max(0, r.reply.at - r.receivedAt));
    if (r.status === 'new') {
      open += 1;
      oldestOpen = oldestOpen === null ? r.receivedAt : Math.min(oldestOpen, r.receivedAt);
    }
    if (r.source !== 'tap') {
      spokenOrTyped += 1;
      if (r.understanding?.viaPictures) viaPictures += 1;
    }
  }

  return {
    total: requests.length,
    open,
    answered: answerTimes.length,
    medianAnswerMs: median(answerTimes),
    spokenOrTyped,
    firstTimeRate: spokenOrTyped ? (spokenOrTyped - viaPictures) / spokenOrTyped : null,
    pictureRate: spokenOrTyped ? viaPictures / spokenOrTyped : null,
    medical,
    byLang,
    oldestOpenMs: oldestOpen === null ? null : Math.max(0, now - oldestOpen),
  };
}

/** "42 s" / "3 min 5 s" for durations on the crew console. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}
