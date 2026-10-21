/**
 * HearMe cabin hub — the crew tablet service from the idea deck.
 *
 * One process on the "crew tablet" (for the demo: a laptop) that:
 *  - serves the passenger web app, seatback screen, crew console and demo stage
 *  - runs the cabin network (WebSocket) and the shared request list
 *  - runs the speech AI offline (Whisper + multilingual-e5)
 * Phones join over the cabin Wi-Fi; nothing needs the internet.
 *
 *   npm run demo          (from the repo root: builds the apps, then starts this)
 *   HEARME_ASR_MODEL=base   lighter/faster speech model
 *   HEARME_NO_AI=1          skip the AI models (taps and typing still work)
 */
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { setPriority } from 'node:os';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { AiEngine } from './ai';
import { loadOrCreateCert } from './cert';
import { asrSizeFromEnv, inferenceThreads } from './models';
import { lanAddresses } from './net';
import { CabinRelay } from './relay';
import { createHandler, type PublicUrls } from './server';

const HTTP_PORT = Number(process.env.PORT ?? 8080);
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 8443);
const STATIC_DIR = process.env.STATIC_DIR ?? fileURLToPath(new URL('../../ife/dist/', import.meta.url));
const VERSION = '0.2.0';

// Keep the laptop responsive for the browser during a live demo.
try {
  setPriority(process.pid, 10);
} catch {
  /* not permitted: fine */
}

const ai = new AiEngine({ asrSize: asrSizeFromEnv(), threads: inferenceThreads() });
const relay = new CabinRelay();
const lan = lanAddresses();
let httpsOk = false;
const urls = (): PublicUrls => {
  const host = lan[0] ?? 'localhost';
  return { base: httpsOk ? `https://${host}:${HTTPS_PORT}` : `http://${host}:${HTTP_PORT}`, lan };
};
const handler = createHandler({ staticDir: STATIC_DIR, ai, relay, urls, version: VERSION });
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
relay.attach(wss);

function wire(server: ReturnType<typeof createHttpServer>) {
  server.on('request', (req, res) => void handler(req, res));
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://hub.local').pathname !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
}

const httpServer = createHttpServer();
wire(httpServer);
httpServer.listen(HTTP_PORT, '0.0.0.0');

try {
  const { key, cert } = await loadOrCreateCert(lan);
  const httpsServer = createHttpsServer({ key, cert });
  wire(httpsServer as unknown as ReturnType<typeof createHttpServer>);
  await new Promise<void>((ok, fail) => {
    httpsServer.once('error', fail);
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => ok());
  });
  httpsOk = true;
} catch (e) {
  console.warn(`HTTPS not available (${String(e)}). Phones will not be able to use the microphone.`);
}

const phone = `${urls().base}/mobile/?seat=23C`;
console.log(`
  HearMe cabin hub ${VERSION}  ·  works with no internet
  ─────────────────────────────────────────────────────────────
  Demo stage     http://localhost:${HTTP_PORT}/#/stage
  Crew console   http://localhost:${HTTP_PORT}/#/crew
  Seatback (IFE) http://localhost:${HTTP_PORT}/?seat=23C#/ife
  Phone (LAN)    ${phone}
  Join page      ${urls().base}/join      Seat cards  ${urls().base}/seats
`);
if (lan.length) console.log(await QRCode.toString(phone, { type: 'terminal', small: true }));

if (process.env.HEARME_NO_AI === '1') {
  console.log('  AI models: off (HEARME_NO_AI=1). Taps, typing (keyword matching) and the crew console still work.\n');
} else {
  console.log(`  Loading AI models (speech: ${ai.status.asr.model}) …`);
  ai.start().then(() => {
    const s = ai.status;
    console.log(`  Meaning model: ${s.embed.state}${s.embed.error ? ` (${s.embed.error})` : ''}`);
    if (ai.warmupMs !== null) console.log(`  Warmed up in ${(ai.warmupMs / 1000).toFixed(1)} s, so the first passenger does not pay for it`);
    console.log(`  Speech model:  ${s.asr.state}${s.asr.error ? ` (${s.asr.error}) — run: npm run models` : ''}\n`);
  });
}

if (process.argv.includes('--open')) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(opener, [`http://localhost:${HTTP_PORT}/#/stage`], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
}

const stop = () => {
  relay.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
