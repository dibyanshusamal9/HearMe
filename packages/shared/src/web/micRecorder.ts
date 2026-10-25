import { floatToPcm16, levelDb, resampleTo16k, understandSpeech, type UnderstandProgress, type UnderstandResult, type UnderstandTarget } from '../cabin/hubClient';
import type { SpeechRecognizer } from '../cabin/speech';
import type { LangCode } from '../types';

/**
 * Browser microphone → cabin hub speech recognition.
 *
 * Uses the browser's built-in echo cancellation, noise suppression and gain
 * control, plus a high-pass filter that removes most engine rumble before the
 * audio leaves the device. The recording is sent once, as 16 kHz PCM, to the
 * hub (crew tablet) for Whisper; it is never stored on either side.
 * Needs a secure page (HTTPS or localhost) for microphone access.
 */

export class MicUnavailableError extends Error {
  constructor(readonly reason: 'denied' | 'unsupported' | 'insecure') {
    super(`microphone ${reason}`);
  }
}

type AudioCtx = AudioContext;

const MAX_SECONDS = 15;

export class MicRecorder {
  private ctx: AudioCtx | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private length = 0;
  private stopTimer?: ReturnType<typeof setTimeout>;
  private onLevel: (db: number) => void = () => undefined;

  static supported(): boolean {
    const g = globalThis as { navigator?: Navigator; AudioContext?: unknown; webkitAudioContext?: unknown };
    return !!g.navigator?.mediaDevices?.getUserMedia && !!(g.AudioContext ?? g.webkitAudioContext);
  }

  async start(onLevel: (db: number) => void, onAutoStop?: () => void): Promise<void> {
    this.cancel();
    const g = globalThis as { isSecureContext?: boolean; AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    if (g.isSecureContext === false) throw new MicUnavailableError('insecure');
    if (!MicRecorder.supported()) throw new MicUnavailableError('unsupported');
    this.onLevel = onLevel;
    const Ctx = (g.AudioContext ?? g.webkitAudioContext)!;
    // Create the context inside the user's gesture (iOS requirement), then ask for the mic.
    const ctx = new Ctx();
    this.ctx = ctx;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (this.ctx !== ctx) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
    } catch (e) {
      this.cancel();
      const name = (e as { name?: string }).name;
      throw new MicUnavailableError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported');
    }
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.ctx !== ctx) return;
    const source = ctx.createMediaStreamSource(this.stream);
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 110;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (ev) => {
      const data = new Float32Array(ev.inputBuffer.getChannelData(0));
      this.chunks.push(data);
      this.length += data.length;
      this.onLevel(Math.round(Math.max(30, 94 + levelDb(data))));
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(highpass).connect(processor).connect(mute).connect(ctx.destination);
    this.processor = processor;
    this.stopTimer = setTimeout(() => onAutoStop?.(), MAX_SECONDS * 1000);
  }

  /** Stop and return 16 kHz mono PCM16 bytes plus the recording length. */
  stop(): { pcm: Uint8Array; seconds: number } {
    const rate = this.ctx?.sampleRate ?? 48000;
    const all = new Float32Array(this.length);
    let at = 0;
    for (const c of this.chunks) {
      all.set(c, at);
      at += c.length;
    }
    this.cancel();
    return { pcm: floatToPcm16(resampleTo16k(all, rate)), seconds: all.length / rate };
  }

  cancel(): void {
    clearTimeout(this.stopTimer);
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.processor = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.chunks = [];
    this.length = 0;
  }
}

/** Record, send to the hub, get back the transcript and its match. */
export async function recordAndUnderstand(
  recorder: MicRecorder,
  hubUrl: string,
  lang: string,
  target: UnderstandTarget,
  onProgress?: (p: UnderstandProgress) => void,
): Promise<UnderstandResult & { seconds: number }> {
  const { pcm, seconds } = recorder.stop();
  if (seconds < 0.3) return { transcript: '', asrMs: 0, matchMs: 0, seconds };
  const result = await understandSpeech(hubUrl, pcm, { lang, target, onProgress });
  return { ...result, seconds };
}

/** `SpeechRecognizer` for web apps: the real microphone, understood by the cabin hub. */
export class HubSpeechRecognizer implements SpeechRecognizer {
  readonly simulated = false;
  private recorder = new MicRecorder();
  private lang: string = 'en';

  constructor(private hubUrl: () => string | null) {}

  async start(lang: string, onLevel: (db: number) => void): Promise<void> {
    this.lang = lang;
    if (!this.hubUrl()) throw new MicUnavailableError('unsupported');
    await this.recorder.start(onLevel);
  }

  async stop(onProgress?: (p: UnderstandProgress) => void) {
    const hub = this.hubUrl();
    if (!hub) {
      this.recorder.cancel();
      return { transcript: '' };
    }
    const r = await recordAndUnderstand(this.recorder, hub, this.lang, 'needs', onProgress);
    return { transcript: r.transcript, match: r.match, ...(r.many ? { many: r.many } : {}) };
  }

  cancel(): void {
    this.recorder.cancel();
  }
}
