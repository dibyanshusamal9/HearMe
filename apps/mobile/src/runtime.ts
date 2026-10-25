import {
  DemoCabinLink,
  MockSpeechRecognizer,
  PassengerSession,
  fetchHubStatus,
  understandSpeech,
  setCloudConsent,
  setProcessingMode,
  type Buzzer,
  type PersistedSession,
  type Speaker,
  type SpeechRecognizer,
} from '@hearme/shared';
import { createBrowserVoice, type ReplyVoice, type SpeakOutcome } from '@hearme/shared/tts';
import { createModeVoice } from '@hearme/shared/voice';
import { HubSpeechRecognizer } from '@hearme/shared/web';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * App-wide runtime: one passenger session for this phone.
 *
 * With a cabin hub (the crew tablet service) the phone talks to the real crew
 * console over the cabin Wi-Fi and speech is understood by the hub's offline
 * Whisper. Without one, it falls back to an in-app simulated crew and a
 * simulated recognizer — always labelled as such.
 */
export const link = new DemoCabinLink('simulated');
export const session = new PassengerSession({ link, device: 'phone' });
// Without a hub, a crew console tab in the same browser (the launcher's preview) takes over from the simulated crew.
if (Platform.OS === 'web') link.watchForConsole();

// ── Cabin hub ─────────────────────────────────────────────────────────────
let hubUrl: string | null = null;
const hubListeners = new Set<() => void>();
const HUB_KEY = 'hearme.hub.v1';

export function getHubUrl(): string | null {
  return hubUrl;
}

export function useHubUrl(): string | null {
  return useSyncExternalStore(
    (cb) => {
      hubListeners.add(cb);
      return () => hubListeners.delete(cb);
    },
    () => hubUrl,
    () => hubUrl,
  );
}

function setHub(url: string | null) {
  hubUrl = url;
  link.setHubUrl(url);
  hubListeners.forEach((l) => l());
}

/** Web: the hub serves this app, so it is the page's own origin. Native: EXPO_PUBLIC_HUB_URL or a saved address. */
async function hubCandidates(): Promise<string[]> {
  if (Platform.OS === 'web') {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    return origin ? [origin] : [];
  }
  const saved = await AsyncStorage.getItem(HUB_KEY).catch(() => null);
  return [saved, process.env.EXPO_PUBLIC_HUB_URL].filter((x): x is string => !!x);
}

/** Look for a cabin hub; switch the link to it when found. Returns true when connected. */
export async function connectHub(explicit?: string): Promise<boolean> {
  const candidates = explicit ? [explicit] : await hubCandidates();
  for (const url of candidates) {
    const clean = url.replace(/\/+$/, '');
    if (await fetchHubStatus(clean)) {
      setHub(clean);
      if (explicit && Platform.OS !== 'web') await AsyncStorage.setItem(HUB_KEY, clean).catch(() => undefined);
      return true;
    }
  }
  return false;
}

/**
 * Keep looking while there is no hub: it may still be starting, or restarting.
 * Looking only once at load left a page opened in that gap on the simulation for good.
 */
export function watchForHub(everyMs = 5000): () => void {
  const timer = setInterval(() => {
    if (!hubUrl) void connectHub().catch(() => false);
  }, everyMs);
  return () => clearInterval(timer);
}

export async function forgetHub(): Promise<void> {
  await AsyncStorage.removeItem(HUB_KEY).catch(() => undefined);
  setHub(null);
}

// ── Speech ────────────────────────────────────────────────────────────────
/** SIMULATED recognizer for runs without a hub or microphone (records nothing). */
export const mockSpeech = new MockSpeechRecognizer();
const hubSpeech = Platform.OS === 'web' ? new HubSpeechRecognizer(() => hubUrl) : null;

/**
 * The real recognizer whenever a hub can understand; the simulation only without one.
 * A device that cannot record (e.g. a phone on plain http) gets the hub recognizer too,
 * which says the microphone is unavailable, instead of a scripted "hot water" sentence.
 */
export function currentSpeech(): SpeechRecognizer {
  return hubSpeech && hubUrl ? hubSpeech : mockSpeech;
}

/**
 * For the scripted demo on the stage: "hears" a given recording instead of
 * the microphone. The recording goes through the real hub (Whisper, then
 * matching), with the same progress display as live speech. `levels` (dB per
 * 100 ms) drive the level meter while it plays.
 */
export function clipRecognizer(wav: ArrayBuffer, levels: number[]): SpeechRecognizer {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lang: Parameters<SpeechRecognizer['start']>[0] = 'hi';
  return {
    simulated: false,
    start(l, onLevel) {
      lang = l;
      let i = 0;
      timer = setInterval(() => onLevel(levels.length ? levels[Math.min(i++, levels.length - 1)]! : 70), 100);
    },
    async stop(onProgress) {
      clearInterval(timer);
      const hub = hubUrl;
      if (!hub) throw new Error('no cabin hub');
      const r = await understandSpeech(hub, new Uint8Array(wav), { lang, mimeType: 'audio/wav', onProgress });
      return { transcript: r.transcript, match: r.match, ...(r.many ? { many: r.many } : {}) };
    },
    cancel() {
      clearInterval(timer);
    },
  };
}

// ── Reading replies aloud ─────────────────────────────────────────────────
/**
 * Native: expo-speech, with the phone's installed voices (most work offline).
 * Reports whether speech really started, so the app can say so when it did not.
 */
function nativeVoice(): ReplyVoice {
  return {
    async hasVoice(bcp47) {
      const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
      if (!voices.length) return null;
      const primary = bcp47.split('-')[0]!.toLowerCase();
      return voices.some((v) => v.language.replace('_', '-').toLowerCase().split('-')[0] === primary);
    },
    speak(text, bcp47, options = {}) {
      let settle!: (o: SpeakOutcome) => void;
      const done = new Promise<SpeakOutcome>((r) => (settle = r));
      let started = false;
      const timer = setTimeout(() => !started && settle('blocked'), 5000);
      const end = (o: SpeakOutcome) => {
        clearTimeout(timer);
        settle(o);
      };
      Speech.stop();
      Speech.speak(text, {
        language: bcp47,
        rate: options.rate ?? 0.9,
        onStart: () => {
          started = true;
          options.onStart?.();
        },
        onDone: () => end('played'),
        onStopped: () => end(started ? 'played' : 'stopped'),
        onError: () => end('blocked'),
      });
      return { done, stop: () => void Speech.stop() };
    },
    unlock: () => undefined,
    stop: () => void Speech.stop(),
  };
}

/**
 * Inside the demo stage the phone is an iframe, which browsers do not let
 * speak on its own; the stage page (where the presenter clicks) reads the
 * reply aloud for it and reports back, so the phone's display stays truthful.
 */
function stageVoice(): ReplyVoice {
  const w = globalThis as unknown as Window;
  let seq = 0;
  const pending = new Map<number, { settle: (o: SpeakOutcome) => void; onStart?: () => void }>();
  w.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { source?: string; id?: number; event?: string; outcome?: SpeakOutcome };
    if (e.origin !== w.location.origin || d?.source !== 'hearme-stage' || typeof d.id !== 'number') return;
    const p = pending.get(d.id);
    if (!p) return;
    if (d.event === 'start') p.onStart?.();
    else if (d.event === 'end') {
      pending.delete(d.id);
      p.settle(d.outcome ?? 'played');
    }
  });
  const post = (msg: object) => w.parent.postMessage({ source: 'hearme-phone', ...msg }, w.location.origin);
  return {
    hasVoice: async () => null,
    speak(text, bcp47, options = {}) {
      const id = ++seq;
      let settle!: (o: SpeakOutcome) => void;
      const done = new Promise<SpeakOutcome>((r) => (settle = r));
      pending.set(id, { settle, onStart: options.onStart });
      setTimeout(() => {
        if (pending.delete(id)) settle('blocked');
      }, 20_000);
      post({ type: 'speak', id, text, bcp47 });
      return { done, stop: () => post({ type: 'stop' }) };
    },
    unlock: () => undefined,
    stop: () => post({ type: 'stop' }),
  };
}

/** No speech engine at all: say so instead of failing silently. */
const silentVoice: ReplyVoice = {
  hasVoice: async () => false,
  speak: () => ({ done: Promise.resolve('no-voice'), stop: () => undefined }),
  unlock: () => undefined,
  stop: () => undefined,
};

/** True when this phone is the one embedded in the demo stage (the stage reads replies aloud for it). */
export const inStage = (() => {
  if (Platform.OS !== 'web') return false;
  const w = globalThis as unknown as Partial<Window>;
  try {
    return !!w.location && new URLSearchParams(w.location.search).get('stage') === '1' && w.parent !== w;
  } catch {
    return false;
  }
})();

/** Reads crew replies aloud in the passenger's language (see `@hearme/shared/tts`). */
const localReplyVoice: ReplyVoice = Platform.OS !== 'web' ? nativeVoice() : inStage ? stageVoice() : (createBrowserVoice() ?? silentVoice);
export const replyVoice: ReplyVoice = Platform.OS === 'web' && !inStage ? createModeVoice(localReplyVoice, () => hubUrl ?? globalThis.location.origin) : localReplyVoice;

/** Browsers only allow speech after a tap: unlock it on the passenger's first one, so replies can speak when they arrive. */
export function unlockVoiceOnFirstTap(): void {
  if (Platform.OS !== 'web') return;
  const w = globalThis as unknown as Window;
  const once = () => {
    replyVoice.unlock();
    w.removeEventListener('pointerdown', once, true);
    w.removeEventListener('keydown', once, true);
  };
  w.addEventListener('pointerdown', once, true);
  w.addEventListener('keydown', once, true);
}

/** The simple `Speaker` shape, for code that only needs to start speech. */
export const speaker: Speaker = {
  available: () => replyVoice !== silentVoice,
  speak: (text, bcp47) => void replyVoice.speak(text, bcp47),
  stop: () => replyVoice.stop(),
};

/** Haptic "buzz" (vibration on web where supported). */
export const buzzer: Buzzer = {
  buzz: () => {
    if (Platform.OS === 'web') {
      (globalThis as { navigator?: { vibrate?: (p: number[]) => boolean } }).navigator?.vibrate?.([120, 80, 120]);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};

// ── Offline app (PWA) ─────────────────────────────────────────────────────
/** Web: cache the app so it opens without a connection after the first visit (needs HTTPS with a trusted certificate, or localhost). */
export function registerOfflineCache(): void {
  if (Platform.OS !== 'web') return;
  const doc = (globalThis as { document?: Document }).document;
  if (doc && !doc.querySelector('link[rel="manifest"]')) {
    const link = doc.createElement('link');
    link.rel = 'manifest';
    link.href = '/mobile/manifest.webmanifest';
    doc.head.appendChild(link);
  }
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (!nav?.serviceWorker) return;
  nav.serviceWorker.register('/mobile/sw.js', { scope: '/mobile/' }).catch(() => undefined);
}

// ── Persistence (phone only — the seatback IFE never persists) ─────────────
const KEY = 'hearme.session.v1';

export async function loadSession(): Promise<'restored' | 'fresh' | 'corrupt'> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return 'fresh';
    const saved = JSON.parse(raw) as PersistedSession;
    if (!saved || typeof saved !== 'object' || !Array.isArray(saved.requests)) throw new Error('bad shape');
    session.hydrate(saved);
    return saved.profile ? 'restored' : 'fresh';
  } catch {
    await AsyncStorage.removeItem(KEY).catch(() => undefined);
    return 'corrupt';
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function startAutosave(): () => void {
  return session.subscribe(() => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(session.snapshot())).catch(() => undefined);
    }, 300);
  });
}

export async function clearStoredSession(resetMode = true): Promise<void> {
  if (resetMode) { setProcessingMode('offline'); setCloudConsent(false); }
  session.clear();
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}
