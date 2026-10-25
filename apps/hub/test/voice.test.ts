import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { OnlineService } from '../src/online/service';
import { OnlineVoice } from '../src/online/voice';
import { AiEngine } from '../src/ai';
import { CabinRelay } from '../src/relay';
import { createHandler } from '../src/server';

const config = { sarvamKey: 'test-sarvam', groqKey: 'test-groq', groqModel: 'openai/gpt-oss-20b', speechModel: 'saaras:v4', timeoutMs: 1000 };
const mp3 = Buffer.from('ID3 synthetic test audio');
const result = () => new Response(JSON.stringify({ audios: [mp3.toString('base64')] }));

describe('Bulbul voice', () => {
  it('sends the complete translated answer and follow-up with the v3 codec and Odia locale', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => result());
    const voice = new OnlineVoice(config, fetcher);
    const text = 'ଆପଣ ପାଣି କିମ୍ବା ଜୁସ୍ ଚାହାନ୍ତି?';
    expect(await voice.synthesize(text, 'or')).toEqual(mp3);
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.sarvam.ai/text-to-speech');
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({ text, language_code: 'od-IN', model: 'bulbul:v3', speaker: 'simran', output_audio_codec: 'mp3' });
  });
  it('rejects missing keys, invalid lengths and unsupported languages before any upload', async () => {
    const fetcher = vi.fn(); const voice = new OnlineVoice(config, fetcher);
    for (const lang of ['as', 'ur', 'ja']) await expect(voice.synthesize('Hello', lang)).rejects.toThrow('ten Indian');
    await expect(voice.synthesize(' ', 'en')).rejects.toThrow('1–2500');
    await expect(voice.synthesize('a'.repeat(2501), 'hi')).rejects.toThrow('1–2500');
    await expect(new OnlineVoice({ ...config, sarvamKey: '' }, fetcher).synthesize('Hello', 'en')).rejects.toThrow('SARVAM_API_KEY');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects empty or malformed audio and sanitizes provider failures', async () => {
    for (const audios of [[], [''], ['not base64!'], ['YQ==', 'Yg=='], 'YQ==']) {
      const voice = new OnlineVoice(config, vi.fn(async () => new Response(JSON.stringify({ audios }))));
      await expect(voice.synthesize('Hello', 'en')).rejects.toThrow('invalid audio');
    }
    const voice = new OnlineVoice(config, vi.fn(async () => new Response('private provider data', { status: 403 })));
    await expect(voice.synthesize('Hello', 'en')).rejects.toThrow('403');
  });
  it('returns private MP3 bytes from the consent-protected HTTP endpoint', async () => {
    const relay = new CabinRelay();
    const handler = createHandler({ ai: new AiEngine({ asrSize: 'base', threads: 1 }), online: new OnlineService(config, vi.fn(async () => result())),
      relay, staticDir: process.cwd(), urls: () => ({ base: 'http://localhost', lan: [] }), version: 'test' });
    const server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/speech`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HearMe-Mode': 'online', 'X-HearMe-Cloud-Consent': 'yes' }, body: JSON.stringify({ text: 'Would you prefer water or juice?', lang: 'en' }),
      });
      expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('audio/mpeg');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(mp3);
    } finally { relay.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
