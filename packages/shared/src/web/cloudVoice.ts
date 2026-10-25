import { cloudHeaders, hasCloudConsent } from '../cabin/cloudConsent';
import { subscribeProcessingMode, usesOnline } from '../cabin/processingMode';
import type { ReplyVoice, SpeakOutcome } from './tts';
import { recordedAnnouncementPath, RecordedAnnouncementPlayer } from './recordedAnnouncements';

export function createModeVoice(localVoice: ReplyVoice | null, baseUrl: () => string): ReplyVoice {
  const local: ReplyVoice = localVoice ?? { hasVoice: async () => false, speak: () => ({ done: Promise.resolve('no-voice'), stop() {} }), unlock() {}, stop() {} };
  const player = new BulbulPlayer(baseUrl);
  const recorded = new RecordedAnnouncementPlayer();
  let settleCurrent: ((value: SpeakOutcome) => void) | undefined;
  let generation = 0;
  const stop = () => { generation++; player.clear(); recorded.stop(); local.stop(); settleCurrent?.('stopped'); settleCurrent = undefined; };
  subscribeProcessingMode(stop);
  const language = (bcp47: string) => bcp47.toLowerCase().split('-')[0]!;
  return {
    hasVoice: (bcp47) => usesOnline(language(bcp47)) ? Promise.resolve(true) : local.hasVoice(bcp47),
    unlock: () => local.unlock(), stop,
    speak(text, bcp47, options = {}) {
      local.stop(); player.stop(); recorded.stop(); settleCurrent?.('stopped');
      const job = ++generation;
      let finished = false;
      let settle!: (value: SpeakOutcome) => void;
      const done = new Promise<SpeakOutcome>((resolve) => { settle = (value) => { if (!finished) { finished = true; resolve(value); } }; });
      settleCurrent = settle;
      const live = () => {
        if (job !== generation || finished) return;
        if (!usesOnline(language(bcp47))) {
          const handle = local.speak(text, bcp47, options);
          void handle.done.then(settle);
          return;
        }
        void player.play(text, language(bcp47), () => settle('played'), () => settle('blocked')).then(() => {
          if (!finished && job === generation) options.onStart?.();
        });
      };
      const path = recordedAnnouncementPath(text, bcp47);
      if (path && typeof Audio !== 'undefined') {
        recorded.play(`${baseUrl().replace(/\/$/, '')}${path}`, () => options.onStart?.(), () => settle('played'), reason => {
          if (job !== generation || finished) return;
          if (reason === 'blocked') settle('blocked');
          else live();
        }, options.rate);
      } else live();
      return { done, stop: () => { if (job === generation) stop(); else settle('stopped'); } };
    },
  };
}

/** One reply in memory. Replays reuse its audio so a blocked autoplay can be retried with a tap. */
export class BulbulPlayer {
  private audio?: HTMLAudioElement;
  private url?: string;
  private key?: string;
  private pending?: AbortController;
  private generation = 0;
  constructor(private baseUrl: () => string) {}

  stop(): void {
    this.generation++;
    this.pending?.abort(); this.pending = undefined;
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; this.audio.pause(); }
  }
  clear(): void {
    this.stop();
    this.audio?.removeAttribute('src'); this.audio = undefined;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined; this.key = undefined;
  }
  async play(text: string, lang: string, onEnd: () => void, onError: (message: string) => void): Promise<void> {
    this.stop();
    const generation = this.generation;
    const current = () => generation === this.generation;
    try {
      if (!hasCloudConsent()) throw new Error('Enable online AI before playing Online speech’s voice.');
      const key = JSON.stringify([text, lang]);
      if (this.key !== key || !this.audio) {
        if (this.url) URL.revokeObjectURL(this.url);
        this.audio = undefined; this.url = undefined; this.key = undefined;
        const controller = new AbortController(); this.pending = controller;
        const response = await fetch(`${this.baseUrl()}/api/speech`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HearMe-Mode': 'online', ...cloudHeaders() },
          body: JSON.stringify({ text, lang }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? 'Online speech’s voice could not load. Try Read reply aloud.');
        }
        if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Online speech’s voice returned invalid audio.');
        const audio = await response.blob();
        if (!current() || !hasCloudConsent()) return;
        if (!audio.size) throw new Error('Online speech’s voice returned empty audio.');
        this.url = URL.createObjectURL(audio);
        this.audio = new Audio(this.url); this.key = key; this.pending = undefined;
      }
      if (!current() || !this.audio) return;
      const audio = this.audio;
      audio.currentTime = 0;
      audio.onended = () => { if (current()) onEnd(); };
      audio.onerror = () => {
        if (!current()) return;
        this.clear(); onError('Online speech’s voice could not play. Try Read reply aloud.');
      };
      try { await audio.play(); }
      catch { if (current()) onError('Playback could not start. Tap Read reply aloud to play Online speech’s reply and follow-up.'); }
    } catch (error) {
      if (current()) onError(error instanceof Error ? error.message : 'Online speech’s voice is unavailable. Try Read reply aloud.');
    }
  }
}
