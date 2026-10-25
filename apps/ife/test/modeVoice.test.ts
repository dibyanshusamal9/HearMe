import { afterEach, expect, it, vi } from 'vitest';
import { setProcessingMode } from '@hearme/shared';
import { createModeVoice } from '@hearme/shared/voice';
import type { ReplyVoice } from '@hearme/shared/tts';

const local: ReplyVoice = { hasVoice: async () => true, speak: vi.fn(() => ({ done: Promise.resolve('played' as const), stop() {} })), unlock() {}, stop() {} };
afterEach(() => { setProcessingMode('offline'); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('keeps offline speech and unsupported Asian languages on device voices', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const voice = createModeVoice(local, () => 'https://hub.test');
  await voice.speak('Hello', 'en-IN').done;
  setProcessingMode('online'); await voice.speak('こんにちは', 'ja-JP').done;
  expect(local.speak).toHaveBeenCalledTimes(2); expect(fetcher).not.toHaveBeenCalled();
});
it('cancels delayed cloud speech when the user switches offline', async () => {
  let respond!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
  const audio = vi.fn(); vi.stubGlobal('fetch', fetcher); vi.stubGlobal('Audio', audio);
  setProcessingMode('online');
  const handle = createModeVoice(local, () => 'https://hub.test').speak('Your water is coming.', 'hi-IN');
  setProcessingMode('offline'); respond(new Response('MP3', { headers: { 'Content-Type': 'audio/mpeg' } }));
  expect(await handle.done).toBe('stopped');
  await Promise.resolve(); await Promise.resolve(); expect(audio).not.toHaveBeenCalled();
});
