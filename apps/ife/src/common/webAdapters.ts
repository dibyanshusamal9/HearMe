import type { Speaker } from '@hearme/shared';

/**
 * Text-to-speech through the browser's Web Speech API. On a real seatback this
 * would route to the passenger's headphone jack via the IFE platform's audio API
 * (not integrated here). Many browsers ship offline voices; given a language,
 * `available()` checks one exists (when the voice list has loaded), and text
 * is always shown as well.
 */
export const browserSpeaker: Speaker = {
  available: (bcp47?: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    const voices = window.speechSynthesis.getVoices();
    if (!bcp47 || voices.length === 0) return true;
    return voices.some((v) => v.lang.toLowerCase().replace('_', '-').startsWith(bcp47.slice(0, 2).toLowerCase()));
  },
  speak(text, bcp47) {
    if (!this.available()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47;
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  },
  stop() {
    if (this.available()) window.speechSynthesis.cancel();
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
