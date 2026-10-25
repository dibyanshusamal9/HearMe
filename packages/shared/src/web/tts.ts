/**
 * Reading crew replies aloud in the browser (Web Speech API), with the
 * checks a live cabin needs:
 *  - picks a voice for the passenger's language (exact locale, then the
 *    language, preferring voices that work offline),
 *  - unlocks speech inside the passenger's first tap (iPhones and Chrome only
 *    allow speech after the person has touched the page),
 *  - reports what really happened: it played, the browser blocked it, or the
 *    device has no voice for the language. Text is always shown as well.
 */

export type SpeakOutcome = 'played' | 'blocked' | 'no-voice' | 'stopped';

export interface SpeakHandle {
  /** Resolves once speech ends or cannot happen. */
  done: Promise<SpeakOutcome>;
  stop(): void;
}

export interface SpeakOptions {
  rate?: number;
  /** Called when the audio actually starts. */
  onStart?: () => void;
}

/** Any engine that can read a reply aloud (browser speech, a phone's native TTS, the demo stage). */
export interface ReplyVoice {
  /** Whether the device has a voice for this language (null: cannot tell). */
  hasVoice(bcp47: string): Promise<boolean | null>;
  speak(text: string, bcp47: string, options?: SpeakOptions): SpeakHandle;
  /** Call inside a tap so later replies may speak without one. */
  unlock(): void;
  stop(): void;
}

interface VoiceLike {
  lang: string;
  name: string;
  localService: boolean;
  default: boolean;
}

const norm = (tag: string) => tag.replace('_', '-').toLowerCase();

/**
 * Best voice for a language: exact locale (hi-IN), then any voice of the
 * language (hi-*), preferring on-device voices (they work with no internet)
 * and the system default. Null when there is none.
 */
export function pickVoice<V extends VoiceLike>(voices: V[], bcp47: string): V | null {
  const want = norm(bcp47);
  const primary = want.split('-')[0]!;
  const score = (v: V) => {
    const lang = norm(v.lang);
    const exact = lang === want ? 4 : lang.split('-')[0] === primary ? 2 : 0;
    if (!exact) return 0;
    return exact + (v.localService ? 1 : 0) + (v.default ? 0.5 : 0);
  };
  let best: V | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const s = score(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

/** Text-to-speech in this browser, or null where the browser has none. */
export function createBrowserVoice(win: Window & typeof globalThis = globalThis as Window & typeof globalThis): ReplyVoice | null {
  const synth = (win as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const Utterance = (win as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
  if (!synth || !Utterance) return null;

  let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;
  const voices = (): Promise<SpeechSynthesisVoice[]> => {
    const now = synth.getVoices();
    if (now.length) return Promise.resolve(now);
    // Chrome loads the list asynchronously; Safari sometimes never fires the event.
    voicesPromise ??= new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const finish = () => resolve(synth.getVoices());
      const timer = setTimeout(finish, 1500);
      synth.addEventListener?.('voiceschanged', () => {
        clearTimeout(timer);
        finish();
      });
    }).then((list) => {
      voicesPromise = null;
      return list;
    });
    return voicesPromise!;
  };

  let unlocked = false;
  return {
    async hasVoice(bcp47) {
      const list = await voices();
      return list.length ? pickVoice(list, bcp47) !== null : null;
    },
    unlock() {
      if (unlocked) return;
      unlocked = true;
      try {
        // A silent utterance inside the tap: afterwards replies may speak on their own (iOS Safari, Chrome).
        const u = new Utterance(' ');
        u.volume = 0;
        synth.speak(u);
      } catch {
        unlocked = false;
      }
    },
    speak(text, bcp47, options = {}) {
      let settle!: (o: SpeakOutcome) => void;
      const done = new Promise<SpeakOutcome>((r) => (settle = r));
      let finished = false;
      let started = false;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const finish = (o: SpeakOutcome) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        settle(o);
      };
      const u = new Utterance(text);
      u.lang = bcp47;
      u.rate = options.rate ?? 0.9;
      u.onstart = () => {
        started = true;
        options.onStart?.();
      };
      u.onend = () => finish('played');
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        const err = e.error;
        if (err === 'interrupted' || err === 'canceled') return finish(started ? 'played' : 'stopped');
        if (err === 'not-allowed') return finish('blocked'); // no tap yet
        if (err === 'language-unavailable' || err === 'voice-unavailable' || err === 'synthesis-unavailable') return finish('no-voice');
        // Anything else (synthesis-failed, audio-busy …): with no voice for the language the device cannot read it.
        void voices().then((list) => finish(pickVoice(list, bcp47) ? 'blocked' : 'no-voice'));
      };
      // If nothing starts within a few seconds the browser silently refused (no voice, or no tap yet).
      watchdog = setTimeout(() => {
        if (started) return;
        synth.cancel();
        // No voices at all, or none for this language: the device cannot read it. Otherwise it was blocked.
        void voices().then((list) => finish(!pickVoice(list, bcp47) ? 'no-voice' : 'blocked'));
      }, 4000);
      synth.cancel();
      if (synth.paused) synth.resume(); // Chrome can get stuck paused
      const list = synth.getVoices();
      const voice = pickVoice(list, bcp47);
      if (voice) u.voice = voice;
      synth.speak(u);
      return {
        done,
        stop: () => {
          synth.cancel();
          finish('stopped');
        },
      };
    },
    stop() {
      synth.cancel();
    },
  };
}
