import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteCrewTablet, floatToPcm16, understandSpeech, type Embedder, type HubEvent, type UnderstandProgress, type WebSocketLike } from '@hearme/shared';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { AiEngine, warmupClip, type Transcriber } from '../src/ai';
import { CabinRelay } from '../src/relay';
import { createHandler } from '../src/server';

const factory = (url: string) => new WebSocket(url) as unknown as WebSocketLike;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fakeEmbedder: Embedder = {
  async embed(texts) {
    return texts.map((t) => {
      const v = new Float32Array(64);
      for (const ch of t.toLowerCase()) v[ch.charCodeAt(0) % 64]! += 1;
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
  },
};

/** A fake Whisper that remembers how it was called and can be made slow. */
function fakeWhisper(delayMs = 0) {
  const calls: { lang: string; maxNewTokens?: number; seconds: number }[] = [];
  const asr: Transcriber = {
    async transcribe(samples, lang, opts) {
      calls.push({ lang, maxNewTokens: opts?.maxNewTokens, seconds: samples.length / 16000 });
      if (delayMs) await sleep(delayMs);
      return lang === 'hi' ? 'मुझे गरम पानी चाहिए' : 'hot water please';
    },
  };
  return { asr, calls };
}

const speech = () => Buffer.from(floatToPcm16(Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i / 5))));

let server: Server | undefined;
let relay: CabinRelay | undefined;

async function startHub(ai: AiEngine): Promise<string> {
  const staticDir = mkdtempSync(join(tmpdir(), 'hearme-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><div id="root"></div>');
  relay = new CabinRelay({ heartbeatMs: 200, pingMs: 60_000 });
  const handler = createHandler({ staticDir, ai, relay, urls: () => ({ base: 'http://localhost', lan: [] }), version: 'test' });
  const wss = new WebSocketServer({ noServer: true });
  relay.attach(wss);
  server = createServer((req, res) => void handler(req, res));
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req)));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  relay?.close();
  if (server) await new Promise((r) => server!.close(r));
  server = undefined;
  relay = undefined;
});

describe('AI warm-up', () => {
  it('runs a short practice inference on each model at start-up, before reporting ready', async () => {
    const { asr, calls } = fakeWhisper();
    const states: string[] = [];
    const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => fakeEmbedder, loadAsr: async () => asr });
    const started = ai.start();
    // The state moves loading → warming → ready.
    for (let i = 0; i < 50 && ai.status.asr.state !== 'ready'; i++) {
      states.push(ai.status.asr.state);
      await sleep(1);
    }
    await started;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ maxNewTokens: 8 });
    expect(calls[0]!.seconds).toBeCloseTo(2, 1);
    expect(ai.status.asr).toMatchObject({ state: 'ready' });
    expect(ai.status.asr.warmupMs).toBeTypeOf('number');
    expect(ai.status.embed).toMatchObject({ state: 'ready' });
    expect(ai.status.embed.warmupMs).toBeTypeOf('number');
    expect(new Set(states)).not.toContain('error');
  });

  it('still reports ready (and the error) when the practice run fails, so taps and typing keep working', async () => {
    const ai = new AiEngine({
      asrSize: 'small',
      threads: 1,
      loadEmbedder: async () => fakeEmbedder,
      loadAsr: async () => ({ transcribe: async () => Promise.reject(new Error('onnx failed')) }),
    });
    await ai.start();
    expect(ai.status.asr.state).toBe('ready');
    expect(ai.status.asr.error).toContain('warm-up failed');
  });

  it('makes a speech-like practice clip that passes the speech gate', () => {
    const clip = warmupClip();
    expect(clip.length).toBe(32000);
    const rms = Math.sqrt(clip.reduce((a, x) => a + x * x, 0) / clip.length);
    expect(rms).toBeGreaterThan(0.01);
    expect(Math.max(...clip.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it('estimates speech time from real requests once there are some', async () => {
    const { asr } = fakeWhisper(30);
    const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => fakeEmbedder, loadAsr: async () => asr });
    await ai.start();
    const fromWarmup = ai.estimateAsrMs();
    expect(fromWarmup).toBeGreaterThanOrEqual(30);
    await ai.transcribe(Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i / 5)), 'en');
    expect(ai.status.asr.typicalMs).toBeGreaterThanOrEqual(25);
  });
});

describe('streamed understanding', () => {
  it('streams received → transcribing (with estimate) → matching (transcript) → done', async () => {
    const { asr } = fakeWhisper(20);
    const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => fakeEmbedder, loadAsr: async () => asr });
    await ai.start();
    const base = await startHub(ai);
    const res = await fetch(`${base}/api/understand?lang=hi`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/L16;rate=16000;channels=1', Accept: 'application/x-ndjson' },
      body: speech(),
    });
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await res.text())
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines.map((l) => l.stage)).toEqual(['received', 'transcribing', 'matching', 'done']);
    expect(lines[1].estimateMs).toBeGreaterThan(0);
    expect(lines[2].transcript).toBe('मुझे गरम पानी चाहिए');
    expect(lines[3].result.match.candidates[0].needId).toBe('hot_water');
  });

  it('the shared client reports each stage and returns the same result', async () => {
    const { asr } = fakeWhisper(10);
    const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => fakeEmbedder, loadAsr: async () => asr });
    await ai.start();
    const base = await startHub(ai);
    const stages: UnderstandProgress['stage'][] = [];
    const result = await understandSpeech(base, speech(), { lang: 'hi', onProgress: (p) => stages.push(p.stage) });
    expect(stages).toEqual(['sending', 'transcribing', 'matching', 'done']);
    expect(result.match?.candidates[0]?.needId).toBe('hot_water');
    // Without onProgress the hub answers with plain JSON, as before.
    const plain = await understandSpeech(base, speech(), { lang: 'en' });
    expect(plain.transcript).toBe('hot water please');
  });

  it('tells the second of two simultaneous recordings that it is queued', async () => {
    const { asr } = fakeWhisper(120);
    const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => fakeEmbedder, loadAsr: async () => asr });
    await ai.start();
    const base = await startHub(ai);
    const first: UnderstandProgress[] = [];
    const second: UnderstandProgress[] = [];
    await Promise.all([
      understandSpeech(base, speech(), { lang: 'hi', onProgress: (p) => first.push(p) }),
      sleep(30).then(() => understandSpeech(base, speech(), { lang: 'en', onProgress: (p) => second.push(p) })),
    ]);
    expect(first.some((p) => p.stage === 'queued')).toBe(false);
    const queued = second.find((p) => p.stage === 'queued');
    expect(queued && queued.stage === 'queued' && queued.ahead).toBeGreaterThanOrEqual(1);
  });

  it('reports a failure inside the stream instead of hanging', async () => {
    let fail = false;
    const ai = new AiEngine({
      asrSize: 'small',
      threads: 1,
      loadEmbedder: async () => fakeEmbedder,
      loadAsr: async () => ({ transcribe: async () => (fail ? Promise.reject(new Error('boom')) : 'ok') }),
    });
    await ai.start();
    fail = true;
    const base = await startHub(ai);
    await expect(understandSpeech(base, speech(), { lang: 'en', onProgress: () => undefined })).rejects.toThrow('hub 500');
  });

  it('shows crew consoles that Whisper is working, then what it understood', async () => {
    const { asr } = fakeWhisper(20);
    const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => fakeEmbedder, loadAsr: async () => asr });
    await ai.start();
    const base = await startHub(ai);
    const crew = new RemoteCrewTablet(base, { factory });
    const events: HubEvent[] = [];
    crew.onEvent((e) => events.push(e));
    try {
      for (let i = 0; i < 100 && !crew.isConnected(); i++) await sleep(10);
      await understandSpeech(base, speech(), { lang: 'hi', onProgress: () => undefined });
      for (let i = 0; i < 100 && events.length < 2; i++) await sleep(10);
      expect(events.map((e) => e.type)).toEqual(['working', 'understood']);
      expect(events[0]).toMatchObject({ type: 'working', lang: 'hi', target: 'needs' });
    } finally {
      crew.dispose();
    }
  });

  it('re-warms on request from the hub laptop and reports the queue in its status', async () => {
    const { asr, calls } = fakeWhisper();
    const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => fakeEmbedder, loadAsr: async () => asr });
    await ai.start();
    const base = await startHub(ai);
    const warm = await (await fetch(`${base}/api/warmup`, { method: 'POST' })).json();
    expect(warm.asrMs).toBeTypeOf('number');
    expect(calls.filter((c) => c.maxNewTokens === 8)).toHaveLength(2);
    const status = await (await fetch(`${base}/api/status`)).json();
    expect(status.queue).toBe(0);
    expect(status.asr.warmupMs).toBeTypeOf('number');
    expect(status.asr.typicalMs).toBeGreaterThanOrEqual(0);
  });
});
