import { ANNOUNCEMENTS } from '../catalog/announcements';
import type { LangCode } from '../types';

/** Only exact, fixed catalogue captions use bundled audio; never an arbitrary passenger sentence. */
export function recordedAnnouncementPath(text: string, bcp47: string): string | undefined {
  const lang = bcp47.replace('_', '-').toLowerCase().split('-')[0] as LangCode;
  const announcement = ANNOUNCEMENTS.find(item => item.text[lang] === text);
  if (!announcement) return undefined;
  // Version each URL by its caption so corrected recordings do not reuse stale cached audio.
  let version = 2166136261;
  for (let index = 0; index < text.length; index++) version = Math.imul(version ^ text.charCodeAt(index), 16777619);
  return `/mobile/announcements/${announcement.id}/${lang}.mp3?v=${(version >>> 0).toString(36)}`;
}

/** Plays a local recording through the same browser media path as Bulbul audio. */
export class RecordedAnnouncementPlayer {
  private audio?: HTMLAudioElement;

  stop(): void {
    if (!this.audio) return;
    this.audio.onended = null; this.audio.onerror = null; this.audio.onplaying = null;
    this.audio.pause(); this.audio.removeAttribute('src'); this.audio = undefined;
  }

  play(url: string, onStart: () => void, onEnd: () => void, onFailure: (reason: 'blocked' | 'unavailable') => void, rate = 1): void {
    this.stop();
    if (typeof Audio === 'undefined') return onFailure('unavailable');
    let audio: HTMLAudioElement;
    try { audio = new Audio(url); } catch { return onFailure('unavailable'); }
    this.audio = audio;
    audio.preload = 'auto'; audio.playbackRate = rate;
    let failed = false;
    let started = false;
    const fail = (reason: 'blocked' | 'unavailable') => {
      if (failed || this.audio !== audio) return;
      failed = true; this.stop(); onFailure(reason);
    };
    audio.onplaying = () => { if (this.audio === audio && !started) { started = true; onStart(); } };
    audio.onended = () => { if (this.audio === audio) onEnd(); };
    audio.onerror = () => fail('unavailable');
    try {
      void Promise.resolve(audio.play()).catch(error => fail((error as { name?: string }).name === 'NotAllowedError' ? 'blocked' : 'unavailable'));
    } catch { fail('unavailable'); }
  }
}
