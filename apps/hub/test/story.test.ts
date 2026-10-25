import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The story folder is read when the module loads, so point it at a scratch folder first.
const storyDir = mkdtempSync(join(tmpdir(), 'hearme-story-'));
process.env.HEARME_STORY_DIR = storyDir;
const recording = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40, 1)]);
writeFileSync(join(storyDir, 'hi.wav'), recording);

let server: Server;
let base: string;

beforeAll(async () => {
  const { AiEngine } = await import('../src/ai');
  const { CabinRelay } = await import('../src/relay');
  const { createHandler } = await import('../src/server');
  const staticDir = mkdtempSync(join(tmpdir(), 'hearme-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html>');
  const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => ({ embed: async (t) => t.map(() => new Float32Array(4)) }) });
  const handler = createHandler({ staticDir, ai, relay: new CabinRelay(), urls: () => ({ base: 'http://localhost', lan: [] }), version: 'test' });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('scripted story on the stage', () => {
  it('gives the sentence and says a person recorded it', async () => {
    const res = await fetch(`${base}/api/story?lang=hi`);
    expect(await res.json()).toEqual({ lang: 'hi', sentence: 'मुझे दवाई के लिए गरम पानी चाहिए', voice: 'recorded' });
  });

  it('serves the recording itself, marked as recorded', async () => {
    const res = await fetch(`${base}/api/story/voice?lang=hi`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(res.headers.get('x-hearme-voice')).toBe('recorded');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(recording);
  });

  it('answers 404 when there is no recording, so the story types the sentence instead', async () => {
    const res = await fetch(`${base}/api/story/voice?lang=ja`);
    expect(res.status).toBe(404);
    expect(await (await fetch(`${base}/api/story?lang=ja`)).json()).toEqual({ lang: 'ja', sentence: null, voice: null });
  });
});
