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
import { loadOrCreateCert, mkcertCaRoot, type HubCertificate } from './cert';
import { asrSizeFromEnv, inferenceThreads } from './models';
import { lanAddresses } from './net';
import { CabinRelay } from './relay';
import { createHandler, joinUrl, type PublicUrls } from './server';
import { OnlineService } from './online/service';
import { loadEnvFile } from 'node:process';

try { loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); } catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}

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
const online = new OnlineService();
const relay = new CabinRelay();
// HEARME_HOST picks the address phones should use when the laptop has several (Wi-Fi, Ethernet, VPN, Docker…).
const lan = [...new Set([process.env.HEARME_HOST, ...lanAddresses()].filter((h): h is string => !!h))];
let httpsOk = false;
let certificate: HubCertificate | null = null;
const urls = (): PublicUrls => {
  // Wi-Fi/hotspot addresses can change while the demo is running. Status is
  // polled by IFE screens, so rebuild advertised URLs from the current network.
  const currentLan = [...new Set([process.env.HEARME_HOST, ...lanAddresses()].filter((h): h is string => !!h))];
  const host = currentLan[0] ?? 'localhost';
  const http = `http://${host}:${HTTP_PORT}`;
  const base = httpsOk ? `https://${host}:${HTTPS_PORT}` : http;
  // Keep certificate setup optional. Casual passengers open the app directly.
  const trust = httpsOk && certificate?.caPem ? `${http}/trust` : undefined;
  const passengerBase = httpsOk && certificate?.source === 'custom' && !certificate.caPem ? base : http;
  const out: PublicUrls = { base, lan: currentLan, trust, passengerBase };
  out.join = joinUrl(out, '23C');
  return out;
};
const handler = createHandler({ staticDir: STATIC_DIR, ai, relay, urls, online, version: VERSION, certificate: () => (httpsOk ? certificate : null) });
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
  certificate = await loadOrCreateCert(lan);
  const { key, cert } = certificate;
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

const phone = urls().join ?? `${urls().base}/mobile/?seat=23C`;
const certLine = !certificate
  ? 'none (phones cannot use the microphone)'
  : certificate.source === 'custom'
    ? 'your own certificate (HEARME_TLS_CERT)'
    : `${certificate.source === 'mkcert' ? 'mkcert' : 'built-in local CA'} · phones trust it once at ${urls().trust ?? '/trust'}`;
console.log(`
  HearMe cabin hub ${VERSION}  ·  works with no internet
  ─────────────────────────────────────────────────────────────
  Demo stage     http://localhost:${HTTP_PORT}/#/stage
  Crew console   http://localhost:${HTTP_PORT}/#/crew
  Seatback (IFE) http://localhost:${HTTP_PORT}/?seat=23C#/ife
  Phone (LAN)    ${phone}
  Join page      ${urls().base}/join      Seat cards  ${urls().base}/seats
  Voice lab      http://localhost:${HTTP_PORT}/#/lab${process.env.HEARME_LAB === '1' ? `   (phones: ${urls().base}/#/lab)` : '   (phones too: start with HEARME_LAB=1)'}
  HTTPS          ${certLine}${certificate?.caFingerprint ? `\n  Root SHA-256   ${certificate.caFingerprint}` : ''}
`);
if (certificate?.source === 'local-ca' && !mkcertCaRoot()) {
  console.log('  Tip: with mkcert installed (brew install mkcert), the hub uses your mkcert CA instead.\n');
}
if (lan.length) console.log(await QRCode.toString(phone, { type: 'terminal', small: true }));

if (process.env.HEARME_NO_AI === '1') {
  console.log('  AI models: off (HEARME_NO_AI=1). Taps, typing (keyword matching) and the crew console still work.\n');
} else {
  console.log(`  Loading and warming up the AI models (speech: ${ai.status.asr.model}) …`);
  const t0 = Date.now();
  ai.start().then(() => {
    const s = ai.status;
    const warm = (ms?: number) => (ms ? `, warmed up in ${(ms / 1000).toFixed(1)} s` : '');
    console.log(`  Meaning model: ${s.embed.state}${warm(s.embed.warmupMs)}${s.embed.error ? ` (${s.embed.error})` : ''}`);
    console.log(`  Speech model:  ${s.asr.state}${warm(s.asr.warmupMs)}${s.asr.error ? ` (${s.asr.error}) — run: npm run models` : ''}`);
    if (s.asr.state === 'ready') console.log(`  Ready after ${((Date.now() - t0) / 1000).toFixed(0)} s: the first request will be as fast as the rest.\n`);
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
