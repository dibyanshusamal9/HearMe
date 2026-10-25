import type { LangCode, PassengerProfile, ReplyId } from '../types';
import type { MatchResult } from '../matching/matcher';
import type { UnderstoodRequests } from '../matching/requests';
import { processingHeaders, usesOnline } from './processingMode';

/**
 * HTTP side of the cabin hub (same origin as its WebSocket). Used by phones,
 * seatback screens and crew consoles. Everything stays on the cabin network.
 */

export interface HubStatus {
  ok: true;
  name: 'hearme-hub';
  version: string;
  asr: ModelInfo;
  embed: ModelInfo;
  /** True when this hub can decode compressed audio (ffmpeg installed). */
  ffmpeg: boolean;
  /**
   * Where other devices can reach the hub (LAN address, HTTPS when available).
   * `join` opens the browser app directly for seat 23C. Certificate setup
   * (`trust`) is optional and is never part of the passenger QR flow.
   */
  urls?: { base: string; lan: string[]; trust?: string; join?: string; passengerBase?: string; phoneLink?: string };
  clients?: number;
  /** Speech/matching jobs waiting on the hub right now. */
  queue?: number;
  /** Optional cloud pipeline; original speech/matching status remains independent. */
  online?: { mode: 'online'; sarvamConfigured: boolean; groqConfigured: boolean; pipeline: string; credentialsVerified: false; translation: { requests: number; hits: number; shared: number; providerCalls: number; lastMs: number } };
}

/**
 * 'warming': loaded, running a first practice inference so the first real
 * request is as fast as the rest. Requests are accepted and wait behind it.
 */
export type ModelState = 'off' | 'loading' | 'warming' | 'ready' | 'error';

export interface ModelInfo {
  model: string;
  state: ModelState;
  /** How long the warm-up run took, in ms. */
  warmupMs?: number;
  /** Median time of recent real runs (speech: one request), in ms. */
  typicalMs?: number;
}

/**
 * What a passenger sees while their speech is being understood:
 *  sending → (queued) → transcribing (Whisper, with an estimate) → matching (shows what was heard) → done.
 */
export type UnderstandProgress =
  | { stage: 'sending' }
  | { stage: 'queued'; ahead: number }
  | { stage: 'transcribing'; estimateMs: number }
  | { stage: 'matching'; transcript: string }
  | { stage: 'done' };

/** One line of the hub's streamed (NDJSON) answer to /api/understand. */
export type UnderstandStreamLine =
  | { stage: 'received'; seconds: number }
  | { stage: 'queued'; ahead: number }
  | { stage: 'transcribing'; estimateMs: number }
  | { stage: 'matching'; transcript: string }
  | { stage: 'done'; result: UnderstandResult }
  | { stage: 'error'; status: number; error: string };

export type UnderstandTarget = 'needs' | 'replies';

export interface UnderstandResult {
  transcript: string;
  asrMs: number;
  matchMs: number;
  /** For target 'needs'. */
  match?: MatchResult;
  /** For target 'needs', when the sentence holds several requests or refuses something: each part matched on its own. */
  many?: UnderstoodRequests;
  /** For target 'replies' (crew speech → closest verified reply). */
  reply?: { replyId: ReplyId | null; confidence: number };
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function join(hubUrl: string, path: string): string {
  return new URL(path, hubUrl.endsWith('/') ? hubUrl : `${hubUrl}/`).toString();
}

/** Returns the hub's status, or null if no hub answers at this URL. */
export async function fetchHubStatus(hubUrl: string, timeoutMs = 2500): Promise<HubStatus | null> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const res = await fetch(join(hubUrl, 'api/status'), { signal, cache: 'no-store' });
      if (!res.ok) return null;
      const body = (await res.json()) as Partial<HubStatus>;
      return body && body.name === 'hearme-hub' ? (body as HubStatus) : null;
    });
  } catch {
    return null;
  }
}

/**
 * Send recorded speech to the hub: Whisper turns it into text on the crew
 * tablet, then it is matched to a need (passengers) or a verified reply (crew).
 * `audio` is 16 kHz mono 16-bit PCM, or a compressed recording with its MIME type.
 * With `onProgress`, the hub streams each stage (queued, transcribing with an
 * estimate, the transcript before matching) so the wait can be shown honestly.
 */
export async function understandSpeech(
  hubUrl: string,
  audio: ArrayBuffer | Uint8Array | Blob,
  options: { lang: string; target?: UnderstandTarget; mimeType?: string; timeoutMs?: number; onProgress?: (p: UnderstandProgress) => void },
): Promise<UnderstandResult> {
  const { lang, target = 'needs', mimeType = 'audio/L16;rate=16000;channels=1', timeoutMs = 30_000, onProgress } = options;
  onProgress?.({ stage: 'sending' });
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(join(hubUrl, `api/understand?lang=${lang}&target=${target}`), {
      method: 'POST',
      headers: { 'Content-Type': mimeType, ...processingHeaders(lang), ...(onProgress ? { Accept: 'application/x-ndjson, application/json' } : {}) },
      body: audio as BodyInit,
      signal,
    });
    if (!res.ok) throw new Error(`hub ${res.status}`);
    // Older hubs (and non-streaming callers) get one JSON answer.
    if (!(res.headers.get('content-type') ?? '').includes('ndjson')) return (await res.json()) as UnderstandResult;
    const result = await readUnderstandStream(res, onProgress ?? (() => undefined));
    onProgress?.({ stage: 'done' });
    return result;
  });
}

/** Parse the hub's NDJSON progress stream; resolves with the final result. Works without streaming bodies (React Native). */
export async function readUnderstandStream(res: Response, onProgress: (p: UnderstandProgress) => void): Promise<UnderstandResult> {
  let result: UnderstandResult | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as UnderstandStreamLine;
    if (msg.stage === 'error') throw new Error(`hub ${msg.status}: ${msg.error}`);
    if (msg.stage === 'done') result = msg.result;
    else if (msg.stage !== 'received') onProgress(msg);
  };
  const body = res.body as ReadableStream<Uint8Array> | null | undefined;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffered.indexOf('\n')) >= 0) {
        handle(buffered.slice(0, nl));
        buffered = buffered.slice(nl + 1);
      }
    }
    handle(buffered + decoder.decode());
  } else {
    (await res.text()).split('\n').forEach(handle);
  }
  if (!result) throw new Error('hub stream ended without a result');
  return result;
}

/** Match typed text on the hub (meaning-based). Returns null if the hub cannot help. */
export async function matchOnHub(
  hubUrl: string,
  text: string,
  options: { lang: string; target?: UnderstandTarget; timeoutMs?: number },
): Promise<UnderstandResult | null> {
  const { lang, target = 'needs', timeoutMs = 4000 } = options;
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const res = await fetch(join(hubUrl, 'api/match'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...processingHeaders(lang) },
        body: JSON.stringify({ text, lang, target }),
        signal,
      });
      if (!res.ok && usesOnline(lang)) throw new Error(`Online request processing failed (${res.status}).`);
      return res.ok ? ((await res.json()) as UnderstandResult) : null;
    });
  } catch {
    if (usesOnline(lang)) throw new Error('Online request processing failed. Try again or select Offline mode.');
    return null;
  }
}

/** Language and needs saved at check-in travel with the booking: look them up by seat. */
export async function lookupBookingOnHub(hubUrl: string, seat: string, timeoutMs = 3000): Promise<PassengerProfile | null> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const res = await fetch(join(hubUrl, `api/booking?seat=${encodeURIComponent(seat)}`), { signal, cache: 'no-store' });
      if (!res.ok) return null;
      const body = (await res.json()) as { profile?: PassengerProfile };
      return body.profile ?? null;
    });
  } catch {
    return null;
  }
}

/** Float32 samples (−1..1) → 16-bit little-endian PCM bytes. */
export function floatToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/** Linear-interpolation resample (good enough for speech going to Whisper). */
export function resampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return samples;
  const ratio = fromRate / 16000;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = samples[i0]! * (1 - frac) + samples[i1]! * frac;
  }
  return out;
}

/** Loudness of a block of samples in dBFS (for the live level meter). */
export function levelDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}
