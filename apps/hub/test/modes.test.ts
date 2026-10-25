import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { floatToPcm16 } from '@hearme/shared';
import { AiEngine } from '../src/ai';
import { OnlineService } from '../src/online/service';
import { CabinRelay } from '../src/relay';
import { createHandler } from '../src/server';

let server: Server; let relay: CabinRelay; let base: string;
let ai: AiEngine; let provider: ReturnType<typeof vi.fn>;
const consent = { 'X-HearMe-Mode': 'online', 'X-HearMe-Cloud-Consent': 'yes', 'Content-Type': 'application/json' };
beforeEach(async () => {
  ai = new AiEngine({ asrSize: 'base', threads: 1, loadAsr: async () => ({ transcribe: async () => 'water please' }),
    loadEmbedder: async () => ({ embed: async (texts) => texts.map(() => new Float32Array([1, 0])) }),
    loadTranslator: async () => ({ translate: async (text, from, to) => `local:${from}:${to}:${text}` }) });
  await ai.start(); relay = new CabinRelay();
  provider = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).endsWith('/speech-to-text') ? { transcript: 'water please' } :
    String(url).endsWith('/translate') ? { translated_text: 'पानी' } : { choices: [{ message: { content: JSON.stringify({ requests: [{ needId: 'water', purposeId: null, confidence: 0.98 }], refused: [] }) } }] })));
  const online = new OnlineService({ sarvamKey: 'test-sarvam', groqKey: 'test-groq', groqModel: 'openai/gpt-oss-20b', speechModel: 'saaras:v4', timeoutMs: 1000 }, provider as typeof fetch);
  const handler = createHandler({ ai, online, relay, staticDir: process.cwd(), urls: () => ({ base: 'http://localhost', lan: [] }), version: 'test' });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { relay.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
it('keeps the original speech path offline with no external provider calls', async () => {
  const response = await fetch(`${base}/api/understand?lang=en`, { method: 'POST', headers: { 'Content-Type': 'audio/L16' }, body: new Uint8Array(floatToPcm16(Float32Array.from({ length: 16000 }, (_, i) => .2 * Math.sin(i)))) });
  expect(response.status).toBe(200); expect((await response.json()).transcript).toBe('water please'); expect(provider).not.toHaveBeenCalled();
});
it('routes the same speech endpoint through Saaras and Groq in online mode, returning only catalogue needs', async () => {
  const response = await fetch(`${base}/api/understand?lang=en`, { method: 'POST', headers: { ...consent, 'Content-Type': 'audio/L16' }, body: new Uint8Array(32000) });
  expect(response.status).toBe(200); const result = await response.json();
  expect(result.match.candidates[0].needId).toBe('water'); expect(result.many.requests[0].confidence).toBe(.98);
  expect(provider.mock.calls.map(([url]) => String(url))).toEqual(['https://api.sarvam.ai/speech-to-text', 'https://api.groq.com/openai/v1/chat/completions']);
});
it('uses local speech for Japanese even when Online mode is selected', async () => {
  const response = await fetch(`${base}/api/understand?lang=ja`, { method: 'POST', headers: { ...consent, 'Content-Type': 'audio/L16' }, body: new Uint8Array(floatToPcm16(Float32Array.from({ length: 16000 }, (_, i) => .2 * Math.sin(i)))) });
  expect(response.status).toBe(200); expect(provider).not.toHaveBeenCalled();
});
it('refuses online processing without consent and retires the old assistant endpoints', async () => {
  const response = await fetch(`${base}/api/match`, { method: 'POST', headers: { 'X-HearMe-Mode': 'online' }, body: JSON.stringify({ text: 'water', lang: 'hi' }) });
  expect(response.status).toBe(428);
  expect((await fetch(`${base}/api/speech`, { method: 'POST', body: '{}' })).status).toBe(428);
  expect((await fetch(`${base}/api/assistant`, { method: 'POST', body: '{}' })).status).toBe(410);
  expect(provider).not.toHaveBeenCalled();
});
it('translates supported pairs with Sarvam and keeps Asian pairs on the original translator', async () => {
  const request = (from: string, to: string) => fetch(`${base}/api/translate`, { method: 'POST', headers: consent, body: JSON.stringify({ text: 'water', from, to }) });
  expect((await (await request('en', 'hi')).json()).text).toBe('पानी');
  expect((await (await request('ja', 'hi')).json()).text).toBe('local:ja:hi:water');
  expect(provider).toHaveBeenCalledTimes(1);
});
