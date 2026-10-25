import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteCrewTablet, floatToPcm16, readUnderstandStream, type Embedder, type HubEvent, type UnderstandProgress, type WebSocketLike } from '@hearme/shared';
import { labTakeQuery, type LabTake, type LabTakeInfo } from '@hearme/shared/lab';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { AiEngine } from '../src/ai';
import { LabLog } from '../src/lab';
import { CabinRelay } from '../src/relay';
import { createHandler } from '../src/server';

// The story folder is read when the module loads; keep the test's recording out of the repo.
process.env.HEARME_STORY_DIR = mkdtempSync(join(tmpdir(), 'hearme-story-'));

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
const speech = (seconds = 1) => Buffer.from(floatToPcm16(Float32Array.from({ length: 16000 * seconds }, (_, i) => 0.3 * Math.sin(i / 5))));

let server: Server | undefined;
let relay: CabinRelay | undefined;
let lab: LabLog;
let base: string;
let heard = 'मुझे गरम पानी चाहिए';

beforeEach(async () => {
  const ai = new AiEngine({ asrSize: 'small', threads: 1, loadEmbedder: async () => fakeEmbedder, loadAsr: async () => ({ transcribe: async () => heard }) });
  await ai.start();
  const staticDir = mkdtempSync(join(tmpdir(), 'hearme-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html>');
  lab = new LabLog(mkdtempSync(join(tmpdir(), 'hearme-lab-')));
  relay = new CabinRelay({ heartbeatMs: 200, pingMs: 60_000 });
  const handler = createHandler({ staticDir, ai, relay, lab, urls: () => ({ base: 'http://localhost', lan: [] }), version: 'test' });
  const wss = new WebSocketServer({ noServer: true });
  relay.attach(wss);
  server = createServer((req, res) => void handler(req, res));
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req)));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  relay?.close();
  if (server) await new Promise((r) => server!.close(r));
  server = undefined;
  heard = 'मुझे गरम पानी चाहिए';
});

const info = (patch: Partial<LabTakeInfo> = {}): LabTakeInfo => ({
  session: 'lab-test-1',
  tester: 'DM',
  speaker: 'passenger',
  lang: 'hi',
  firstLanguage: true,
  place: 'quiet',
  mic: 'laptop',
  mode: 'read',
  expected: 'hot_water',
  prompt: 'मुझे गर्म पानी की ज़रूरत है',
  keepAudio: false,
  ...patch,
});

async function record(patch: Partial<LabTakeInfo> = {}, onProgress?: (p: UnderstandProgress) => void): Promise<LabTake> {
  const res = await fetch(`${base}/api/lab/take?${labTakeQuery(info(patch))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/L16;rate=16000;channels=1', Accept: 'application/x-ndjson' },
    body: speech(),
  });
  expect(res.status).toBe(200);
  const result = await readUnderstandStream(res, onProgress ?? (() => undefined));
  return (result as typeof result & { take: LabTake }).take;
}

describe('voice lab on the hub', () => {
  it('runs the real pipeline with progress, scores the take and logs it (no recording kept)', async () => {
    const stages: string[] = [];
    const take = await record({}, (p) => stages.push(p.stage));
    expect(stages).toEqual(['transcribing', 'matching']);
    expect(take).toMatchObject({ speaker: 'passenger', lang: 'hi', expected: 'hot_water', transcript: 'मुझे गरम पानी चाहिए', got: 'hot_water', seconds: 1, model: 'onnx-community/whisper-small' });
    expect(take.outcome).toBe('right');
    expect(take.hubMs).toBeGreaterThanOrEqual(take.asrMs);
    expect(take.audio).toBeUndefined();
    const logged = readFileSync(lab.file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as LabTake);
    expect(logged).toEqual([take]);
    expect(existsSync(lab.audioDir)).toBe(false);
  });

  it('counts a confident wrong picture as "wrong", and nothing heard as "silent"', async () => {
    // Asked for tea, Whisper heard "hot water": the hot water picture is shown, ready to send.
    expect(await record({ expected: 'tea' })).toMatchObject({ outcome: 'wrong', got: 'hot_water' });
    heard = '';
    expect((await record()).outcome).toBe('silent');
  });

  it('keeps the recording only when the speaker asked, as a 16 kHz WAV', async () => {
    const take = await record({ keepAudio: true });
    expect(take.audio).toBe(`${take.id}.wav`);
    const wav = readFileSync(join(lab.audioDir, take.audio!));
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.length).toBe(44 + 16000 * 2);
  });

  it('does not show lab takes on the stage or the crew tablet', async () => {
    const crew = new RemoteCrewTablet(base, { factory: (url: string) => new WebSocket(url) as unknown as WebSocketLike });
    const events: HubEvent[] = [];
    crew.onEvent((e) => events.push(e));
    try {
      for (let i = 0; i < 100 && !crew.isConnected(); i++) await sleep(10);
      await record();
      await sleep(100);
      expect(events).toEqual([]);
    } finally {
      crew.dispose();
    }
  });

  it('lists takes, exports CSV for spreadsheets, and discards a take with its recording', async () => {
    const a = await record({ keepAudio: true });
    const b = await record({ expected: 'water' });
    const list = (await (await fetch(`${base}/api/lab/takes`)).json()) as { takes: LabTake[]; storyCanSave: boolean };
    expect(list.takes.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(list.storyCanSave).toBe(true);
    const csv = await fetch(`${base}/api/lab/takes.csv`);
    expect(csv.headers.get('content-disposition')).toContain('hearme-voice-lab.csv');
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await csv.arrayBuffer());
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.split('\r\n')).toHaveLength(4);
    expect(text).toContain('मुझे गरम पानी चाहिए');
    expect((await fetch(`${base}/api/lab/takes/${a.id}/discard`, { method: 'POST' })).status).toBe(200);
    expect(lab.list().map((t) => t.id)).toEqual([b.id]);
    expect(existsSync(join(lab.audioDir, a.audio!))).toBe(false);
    expect((await fetch(`${base}/api/lab/takes/${a.id}/discard`, { method: 'POST' })).status).toBe(404);
  });

  it('records language-pack speakers (Bengali) in own words, and refuses reading for them', async () => {
    const take = await record({ lang: 'bn', mode: 'own-words', prompt: '' });
    expect(take).toMatchObject({ lang: 'bn', mode: 'own-words' });
    const read = await fetch(`${base}/api/lab/take?${labTakeQuery(info({ lang: 'bn', mode: 'read' }))}`, { method: 'POST', body: speech() });
    expect(read.status).toBe(400);
  });

  it('refuses takes that do not say what was asked', async () => {
    const res = await fetch(`${base}/api/lab/take?${labTakeQuery(info({ expected: 'champagne' }))}`, { method: 'POST', body: speech() });
    expect(res.status).toBe(400);
    expect(lab.list()).toEqual([]);
  });

  it('a good take of the story sentence becomes Sharda’s voice in the stage story', async () => {
    const save = await fetch(`${base}/api/story/voice?lang=hi`, { method: 'POST', headers: { 'Content-Type': 'audio/L16;rate=16000;channels=1' }, body: speech(2) });
    expect(save.status).toBe(200);
    expect(((await save.json()) as { saved: string }).saved).toBe(join(process.env.HEARME_STORY_DIR!, 'hi.wav'));
    const voice = await fetch(`${base}/api/story/voice?lang=hi`);
    expect(voice.headers.get('x-hearme-voice')).toBe('recorded');
    expect((await voice.arrayBuffer()).byteLength).toBe(44 + 2 * 16000 * 2);
    const short = await fetch(`${base}/api/story/voice?lang=hi`, { method: 'POST', headers: { 'Content-Type': 'audio/L16;rate=16000;channels=1' }, body: speech(0.5) });
    expect(short.status).toBe(400);
  });
});
