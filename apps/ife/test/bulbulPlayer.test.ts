import { afterEach, expect, it, vi } from 'vitest';
import { setCloudConsent } from '@hearme/shared';
import { BulbulPlayer } from '@hearme/shared/voice';

afterEach(() => { setCloudConsent(false); vi.unstubAllGlobals(); });
it('does not start playback if a delayed synthesis finishes after Tara closes', async () => {
  setCloudConsent(true);
  let respond!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const createAudio = vi.fn(); vi.stubGlobal('Audio', createAudio);
  const player = new BulbulPlayer(() => 'https://hub.test'); const end = vi.fn(); const error = vi.fn();
  const pending = player.play('Would you prefer water or juice?', 'en', end, error);
  player.clear();
  respond(new Response('MP3', { headers: { 'Content-Type': 'audio/mpeg' } }));
  await pending;
  expect(createAudio).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});
it('checks current consent before requesting any speech', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const error = vi.fn();
  await new BulbulPlayer(() => 'https://hub.test').play('Hello', 'en', vi.fn(), error);
  expect(fetcher).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledWith(expect.stringContaining('Enable online AI'));
});
