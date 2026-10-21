import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, type HubStatus, type LangCode, type UnderstandResult, type UnderstandTarget } from '@hearme/shared';
import type { AiEngine } from './ai';
import { AudioError, decodeAudio, hasFfmpeg } from './audio';
import { lookupBooking } from './booking';
import { joinPage, qrSvg, seatCardsPage, trustPage } from './pages';
import type { CabinRelay } from './relay';

export interface PublicUrls {
  /** Best URL for other devices (LAN + HTTPS when available). */
  base: string;
  lan: string[];
}

export interface HandlerOptions {
  staticDir: string;
  ai: AiEngine;
  relay: CabinRelay;
  urls: () => PublicUrls;
  version: string;
  /** Public certificate of the local CA when the hub uses mkcert (served at /ca.pem for phones to install). */
  caPath?: () => string | null;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

const LANG_CODES = new Set<string>(LANGUAGES.map((l) => l.code));
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024;

function send(res: ServerResponse, status: number, body: string | Buffer, type = 'application/json; charset=utf-8'): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const json = (res: ServerResponse, status: number, value: unknown) => send(res, status, JSON.stringify(value));

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new AudioError('request too large', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseLang(v: unknown): LangCode | null {
  return typeof v === 'string' && LANG_CODES.has(v) ? (v as LangCode) : null;
}

function parseTarget(v: unknown): UnderstandTarget {
  return v === 'replies' ? 'replies' : 'needs';
}

/** Voice-lab results file (text only), read by `npm run voicelab`. */
const VOICELAB_FILE = fileURLToPath(new URL('../.eval/voicelab.jsonl', import.meta.url));
function appendVoiceLab(row: object): void {
  mkdirSync(dirname(VOICELAB_FILE), { recursive: true });
  appendFileSync(VOICELAB_FILE, `${JSON.stringify(row)}\n`);
}

export function createHandler(opts: HandlerOptions) {
  const root = resolve(opts.staticDir);

  /** One of the 6 languages, or a language pack's code (understood, but no screens yet). */
  const parseAnyLang = (v: unknown): string | null =>
    parseLang(v) ?? (typeof v === 'string' && opts.ai.languagePacks().some((p) => p.code === v) ? v : null);
  /** Only the laptop running the hub (the demo stage) may change models or reload languages. */
  const fromHubLaptop = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');

  async function understandText(text: string, lang: string, target: UnderstandTarget, asrMs: number): Promise<UnderstandResult> {
    const t0 = Date.now();
    const result: UnderstandResult = { transcript: text, asrMs, matchMs: 0 };
    if (target === 'needs') result.match = await opts.ai.matchNeeds(text);
    else result.reply = await opts.ai.matchReply(text);
    result.matchMs = Date.now() - t0;
    if (text) {
      opts.relay.emitEvent({
        type: 'understood',
        at: Date.now(),
        target,
        lang,
        transcript: text,
        match: target === 'needs' ? result.match?.candidates[0]?.needId : (result.reply?.replyId ?? undefined),
        confidence: target === 'needs' ? (result.match?.confidence ?? 0) : (result.reply?.confidence ?? 0),
        asrMs,
        matchMs: result.matchMs,
      });
    }
    return result;
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const path = url.pathname;
    if (path === '/api/status' && req.method === 'GET') {
      const urls = opts.urls();
      const status: HubStatus & { urls: PublicUrls; clients: number } = {
        ok: true,
        name: 'hearme-hub',
        version: opts.version,
        asr: { model: opts.ai.status.asr.model, state: opts.ai.status.asr.state },
        embed: { model: opts.ai.status.embed.model, state: opts.ai.status.embed.state },
        ffmpeg: hasFfmpeg(),
        urls,
        clients: opts.relay.clientCount,
      };
      return json(res, 200, status);
    }
    if (path === '/api/understand' && req.method === 'POST') {
      const lang = parseAnyLang(url.searchParams.get('lang'));
      if (!lang) return json(res, 400, { error: 'unknown language' });
      if (!opts.ai.canTranscribe) return json(res, 503, { error: 'speech model is not ready yet' });
      const body = await readBody(req, MAX_AUDIO_BYTES);
      const samples = await decodeAudio(body, req.headers['content-type']);
      const t0 = Date.now();
      const transcript = await opts.ai.transcribe(samples, lang);
      return json(res, 200, await understandText(transcript, lang, parseTarget(url.searchParams.get('target')), Date.now() - t0));
    }
    if (path === '/api/voicelab' && req.method === 'POST') {
      // Voice lab results: text only (never audio), appended for `npm run voicelab`.
      let v: Record<string, unknown>;
      try {
        v = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8')) as Record<string, unknown>;
      } catch {
        return json(res, 400, { error: 'invalid JSON' });
      }
      const str = (x: unknown, max: number) => (typeof x === 'string' && x.length <= max ? x : null);
      const lang = parseAnyLang(v.lang);
      const expected = str(v.expected, 40);
      const transcript = str(v.transcript, 300);
      if (!lang || !expected || transcript === null || typeof v.confidence !== 'number' || typeof v.asrMs !== 'number') return json(res, 400, { error: 'invalid result' });
      const top3 = Array.isArray(v.top3) ? v.top3.filter((x): x is string => typeof x === 'string').slice(0, 3) : [];
      const row = { at: new Date().toISOString(), lang, expected, transcript, got: str(v.got, 40), top3, confidence: v.confidence, asrMs: v.asrMs, noise: v.noise === true, speaker: str(v.speaker, 8) ?? undefined };
      appendVoiceLab(row);
      return json(res, 201, { ok: true });
    }
    if (path === '/api/languages' && req.method === 'GET') {
      return json(res, 200, {
        builtIn: LANGUAGES.map((l) => ({ code: l.code, name: l.englishName })),
        packs: opts.ai.languagePacks().map((p) => ({ code: p.code, name: p.name, draft: p.draft ?? 'human', needs: Object.keys(p.needs).length, speech: !!p.whisper })),
      });
    }
    if (path === '/api/languages/reload' && req.method === 'POST') {
      if (!fromHubLaptop(req)) return json(res, 403, { error: 'only from the hub laptop' });
      await opts.ai.reloadLanguages();
      return json(res, 200, { packs: opts.ai.languagePacks().map((p) => p.code) });
    }
    if (path === '/api/asr' && req.method === 'POST') {
      if (!fromHubLaptop(req)) return json(res, 403, { error: 'only from the hub laptop' });
      const size = url.searchParams.get('size');
      if (size !== 'small' && size !== 'base') return json(res, 400, { error: 'size must be small or base' });
      void opts.ai.switchAsr(size);
      return json(res, 202, { switching: size });
    }
    if (path === '/api/match' && req.method === 'POST') {
      const body = await readBody(req, MAX_JSON_BYTES);
      let input: { text?: unknown; lang?: unknown; target?: unknown };
      try {
        input = JSON.parse(body.toString('utf8'));
      } catch {
        return json(res, 400, { error: 'invalid JSON' });
      }
      const lang = parseAnyLang(input.lang);
      if (!lang || typeof input.text !== 'string' || input.text.length > 300) return json(res, 400, { error: 'invalid request' });
      return json(res, 200, await understandText(input.text.trim(), lang, parseTarget(input.target), 0));
    }
    if (path === '/api/booking' && req.method === 'GET') {
      const profile = lookupBooking(String(url.searchParams.get('seat') ?? '').toUpperCase());
      return profile ? json(res, 200, { profile, source: 'sample manifest' }) : json(res, 404, { error: 'no booking for this seat' });
    }
    if (path === '/api/qr.svg' && req.method === 'GET') {
      const data = url.searchParams.get('data') ?? '';
      if (!data || data.length > 500) return json(res, 400, { error: 'invalid data' });
      return send(res, 200, await qrSvg(data, Number(url.searchParams.get('size')) || 220), 'image/svg+xml');
    }
    return json(res, 404, { error: 'not found' });
  }

  function serveStatic(res: ServerResponse, pathname: string): void {
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = resolve(join(root, normalize(rel)));
    if (!file.startsWith(root + '/') && file !== root) return send(res, 403, 'forbidden', 'text/plain');
    if (!existsSync(file) || !statSync(file).isFile()) {
      // "/mobile" without the slash, or a page that has not been built yet.
      if (existsSync(join(file, 'index.html'))) {
        res.writeHead(301, { Location: `${pathname}/` });
        return void res.end();
      }
      return send(res, 404, 'not found — run `npm run build` first', 'text/plain; charset=utf-8');
    }
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const hashed = /\/assets\/|\/_expo\/static\/|\.[0-9a-f]{8,}\./.test(file);
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': type.startsWith('text/html') || file.endsWith('sw.js') ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'microphone=(self), camera=(self)',
    });
    createReadStream(file).pipe(res);
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://hub.local');
    try {
      if (url.pathname.startsWith('/api/')) {
        // LAN-only API with no cookies: allow the Expo dev server and native apps to call it.
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        if (req.method === 'OPTIONS') return void res.writeHead(204).end();
        return await api(req, res, url);
      }
      const urls = opts.urls();
      if (url.pathname === '/join') {
        return send(res, 200, await joinPage(`${urls.base}/mobile/?seat=23C`, `${urls.base}/#/crew`, `${urls.base}/#/stage`), 'text/html; charset=utf-8');
      }
      if (url.pathname === '/ca.pem') {
        // Only the CA's public certificate (rootCA.pem), never its key.
        const ca = opts.caPath?.();
        if (!ca || !existsSync(ca)) return send(res, 404, 'This hub uses a self-signed certificate (install mkcert for a trusted one).', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename="hearme-cabin-ca.pem"');
        return send(res, 200, readFileSync(ca), 'application/x-x509-ca-cert');
      }
      if (url.pathname === '/trust') {
        return send(res, 200, trustPage(!!opts.caPath?.(), `${urls.base}/mobile/?seat=23C`, urls.lan[0] ? `http://${urls.lan[0]}:8080/ca.pem` : '/ca.pem'), 'text/html; charset=utf-8');
      }
      if (url.pathname === '/seats') {
        const rows = [21, 22, 23, 24, 25, 26];
        const seats = rows.flatMap((r) => ['A', 'B', 'C', 'D', 'E', 'F'].map((c) => `${r}${c}`)).concat('31A');
        return send(res, 200, await seatCardsPage(urls.base, seats), 'text/html; charset=utf-8');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
      return serveStatic(res, url.pathname);
    } catch (e) {
      if (e instanceof AudioError) return json(res, e.status, { error: e.message });
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
    }
  };
}
