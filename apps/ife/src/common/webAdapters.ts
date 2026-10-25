import type { Speaker } from '@hearme/shared';
import { getProcessingMode } from '@hearme/shared';
import { createBrowserVoice } from '@hearme/shared/tts';
import { createModeVoice } from '@hearme/shared/voice';
import { hubBaseUrl } from './hub';

/**
 * Text-to-speech through the browser's Web Speech API, with the shared voice
 * choice (the passenger's language, on-device voices first). On a real
 * seatback this would route to the headphone jack via the IFE platform's
 * audio API (not integrated here). Text is always shown as well.
 */
const localVoice = typeof window !== 'undefined' ? createBrowserVoice() : null;
const voice = createModeVoice(localVoice, hubBaseUrl);
if (typeof window !== 'undefined') {
  const unlock = () => voice?.unlock();
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

export const browserSpeaker: Speaker = {
  available: () => typeof Audio !== 'undefined' || localVoice !== null || getProcessingMode() === 'online',
  speak(text, bcp47) {
    void voice.speak(text, bcp47).done.then((outcome) => {
      window.dispatchEvent(new CustomEvent('hearme-playback', { detail: outcome }));
    });
  },
  stop() {
    voice?.stop();
  },
};

/**
 * MOCK seat-identity adapter. A real IFE knows its seat from the aircraft
 * configuration; here it comes from `?seat=` (default 23C, the PDF's example).
 */
export function ifeSeatFromUrl(): string {
  const raw = new URLSearchParams(window.location.search).get('seat') ?? '';
  return /^([1-9]|[1-6][0-9]|70)[A-HJK]$/.test(raw.toUpperCase()) ? raw.toUpperCase() : '23C';
}
