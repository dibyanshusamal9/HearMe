import { CONFIDENCE_THRESHOLD } from '../matching/matcher';
import type { MatchResult } from '../matching/matcher';
import type { UnderstoodRequests } from '../matching/requests';
import type { PassengerSession } from '../session/session';
import type { RequestSource } from '../types';

/** Forward only requests explicitly identified as outside the catalogue by online analysis. */
export function submitUncategorized(session: PassengerSession, transcript: string, source: RequestSource, match: MatchResult, many?: UnderstoodRequests): boolean {
  const said = transcript.trim().slice(0, 300);
  if (source === 'tap' || !said || !many?.other?.english) return false;
  const result = session.submit({ needId: 'call_crew', source, understanding: {
    confidence: match.confidence, viaPictures: false, said,
    ...(many?.other?.english ? { english: many.other.english } : {}),
  } });
  return result.ok || result.reason === 'duplicate';
}

/** Submit only explicit, confidently recognized catalogue needs; refusals always win. */
export function autoSubmitSpeech(session: PassengerSession, match: MatchResult, many?: UnderstoodRequests): number {
  const refused = new Set(many?.refused ?? []);
  const candidates = many ? many.requests : match.candidates.slice(0, 1).map((item) => ({ needId: item.needId, confidence: match.confidence, purposeId: match.purposeId }));
  let submitted = 0;
  for (const item of new Map(candidates.map((item) => [item.needId, item])).values()) {
    if (refused.has(item.needId) || item.confidence < CONFIDENCE_THRESHOLD) continue;
    const result = session.submit({ needId: item.needId, ...(item.purposeId ? { purposeId: item.purposeId } : {}), source: 'speech', understanding: { confidence: item.confidence, viaPictures: false } });
    if (result.ok || result.reason === 'duplicate') submitted++;
  }
  return submitted;
}

/** dB levels are the recorder's 30..94 meter values. A pause ends a voiced request once. */
export class SpeechPauseDetector {
  private lastVoice = 0;
  private voicedFrames = 0;
  private ended = false;
  constructor(private startedAt: number, private pauseMs = 1200) {}
  get hasSpeech(): boolean { return this.voicedFrames >= 2; }
  update(level: number, now: number): boolean {
    if (this.ended) return false;
    if (level > 56) { this.lastVoice = now; this.voicedFrames++; }
    if ((this.voicedFrames >= 2 && now - this.startedAt > 1500 && now - this.lastVoice >= this.pauseMs) || now - this.startedAt >= 15000) {
      this.ended = true; return true;
    }
    return false;
  }
}
