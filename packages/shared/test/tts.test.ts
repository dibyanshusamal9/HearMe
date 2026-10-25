import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserVoice, pickVoice } from '../src/web/tts';

const v = (lang: string, name: string, localService = true, isDefault = false) => ({ lang, name, localService, default: isDefault });

describe('pickVoice', () => {
  const voices = [v('en-US', 'Samantha', true, true), v('hi-IN', 'Google हिन्दी', false), v('hi-IN', 'Lekha', true), v('ja_JP', 'Kyoko'), v('th', 'Kanya')];

  it('prefers the exact locale and an on-device voice (works without internet)', () => {
    expect(pickVoice(voices, 'hi-IN')?.name).toBe('Lekha');
  });
  it('accepts underscores and falls back to any voice of the language', () => {
    expect(pickVoice(voices, 'ja-JP')?.name).toBe('Kyoko');
    expect(pickVoice(voices, 'th-TH')?.name).toBe('Kanya');
  });
  it('returns null when the device has no voice for the language', () => {
    expect(pickVoice(voices, 'vi-VN')).toBeNull();
  });
});

/** A scriptable stand-in for window.speechSynthesis. */
function fakeWindow(voices: ReturnType<typeof v>[], behave: 'speak' | 'block' | 'fail' | 'silent') {
  const spoken: { text: string; volume: number; voice?: { name: string } }[] = [];
  class Utterance {
    lang = '';
    rate = 1;
    volume = 1;
    voice?: { name: string };
    onstart?: () => void;
    onend?: () => void;
    onerror?: (e: { error: string }) => void;
    constructor(public text: string) {}
  }
  const synth = {
    paused: false,
    getVoices: () => voices,
    cancel: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn(),
    speak(u: Utterance) {
      spoken.push({ text: u.text, volume: u.volume, voice: u.voice });
      if (u.text.trim() === '') return;
      if (behave === 'speak') {
        setTimeout(() => u.onstart?.(), 10);
        setTimeout(() => u.onend?.(), 50);
      } else if (behave === 'block') setTimeout(() => u.onerror?.({ error: 'not-allowed' }), 10);
      else if (behave === 'fail') setTimeout(() => u.onerror?.({ error: 'synthesis-failed' }), 10);
    },
  };
  return { win: { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } as unknown as Window & typeof globalThis, spoken };
}

describe('createBrowserVoice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports "played" only after the audio really started and ended, with the chosen voice', async () => {
    const { win, spoken } = fakeWindow([v('hi-IN', 'Lekha')], 'speak');
    const voice = createBrowserVoice(win)!;
    const started = vi.fn();
    const h = voice.speak('हम इसे तुरंत ला रहे हैं।', 'hi-IN', { onStart: started });
    await vi.advanceTimersByTimeAsync(100);
    await expect(h.done).resolves.toBe('played');
    expect(started).toHaveBeenCalledOnce();
    expect(spoken[0]?.voice?.name).toBe('Lekha');
  });

  it('reports "blocked" when the browser refuses (no tap yet)', async () => {
    const { win } = fakeWindow([v('hi-IN', 'Lekha')], 'block');
    const h = createBrowserVoice(win)!.speak('x', 'hi-IN');
    await vi.advanceTimersByTimeAsync(50);
    await expect(h.done).resolves.toBe('blocked');
  });

  it('reports "no-voice" when nothing starts and the device has no voice for the language (or none at all)', async () => {
    const { win } = fakeWindow([v('en-US', 'Samantha')], 'silent');
    const voice = createBrowserVoice(win)!;
    await expect(voice.hasVoice('vi-VN')).resolves.toBe(false);
    const h = voice.speak('Chúng tôi đang mang đến ngay.', 'vi-VN');
    await vi.advanceTimersByTimeAsync(4500);
    await expect(h.done).resolves.toBe('no-voice');
    const none = createBrowserVoice(fakeWindow([], 'silent').win)!.speak('x', 'hi-IN');
    await vi.advanceTimersByTimeAsync(6500);
    await expect(none.done).resolves.toBe('no-voice');
  });

  it('tells "no voice" from "blocked" when synthesis fails (headless browsers, phones without voices)', async () => {
    const none = createBrowserVoice(fakeWindow([], 'fail').win)!.speak('x', 'hi-IN');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(none.done).resolves.toBe('no-voice');
    const busy = createBrowserVoice(fakeWindow([v('hi-IN', 'Lekha')], 'fail').win)!.speak('x', 'hi-IN');
    await vi.advanceTimersByTimeAsync(100);
    await expect(busy.done).resolves.toBe('blocked');
  });

  it('reports "blocked" when a voice exists but nothing starts', async () => {
    const h = createBrowserVoice(fakeWindow([v('hi-IN', 'Lekha')], 'silent').win)!.speak('x', 'hi-IN');
    await vi.advanceTimersByTimeAsync(4500);
    await expect(h.done).resolves.toBe('blocked');
  });

  it('unlocks speech once with a silent utterance (inside the first tap)', () => {
    const { win, spoken } = fakeWindow([v('hi-IN', 'Lekha')], 'speak');
    const voice = createBrowserVoice(win)!;
    voice.unlock();
    voice.unlock();
    expect(spoken).toEqual([{ text: ' ', volume: 0, voice: undefined }]);
  });

  it('is null where the browser has no speech synthesis', () => {
    expect(createBrowserVoice({} as Window & typeof globalThis)).toBeNull();
  });
});
