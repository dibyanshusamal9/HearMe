import {
  DemoCabinLink,
  MockSpeechRecognizer,
  PassengerSession,
  fetchHubStatus,
  type Buzzer,
  type PersistedSession,
  type Speaker,
  type SpeechRecognizer,
} from '@hearme/shared';
import { HubSpeechRecognizer, MicRecorder } from '@hearme/shared/web';
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

export async function forgetHub(): Promise<void> {
  await AsyncStorage.removeItem(HUB_KEY).catch(() => undefined);
  setHub(null);
}

// ── Speech ────────────────────────────────────────────────────────────────
/** SIMULATED recognizer for runs without a hub or microphone (records nothing). */
export const mockSpeech = new MockSpeechRecognizer();
const hubSpeech = Platform.OS === 'web' ? new HubSpeechRecognizer(() => hubUrl) : null;

/** The real recognizer when this device can record and a hub can understand; otherwise the simulation. */
export function currentSpeech(): SpeechRecognizer {
  return hubSpeech && hubUrl && MicRecorder.supported() ? hubSpeech : mockSpeech;
}

/** On-device text-to-speech (expo-speech). Uses the phone's installed voices, which work offline on most devices. */
export const speaker: Speaker = {
  // On the web, the browser reads aloud with the phone's own voices; a phone may have none for Hindi or Thai.
  available: (bcp47) => {
    const synth = Platform.OS === 'web' ? (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis : undefined;
    const voices = synth?.getVoices() ?? [];
    if (!bcp47 || voices.length === 0) return true; // native, or voices not loaded yet: assume yes
    const want = bcp47.slice(0, 2).toLowerCase();
    return voices.some((v) => v.lang.toLowerCase().replace('_', '-').startsWith(want));
  },
  speak: (text, bcp47) => {
    Speech.stop();
    Speech.speak(text, { language: bcp47, rate: 0.9 });
  },
  stop: () => {
    Speech.stop();
  },
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

export async function clearStoredSession(): Promise<void> {
  session.clear();
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}
