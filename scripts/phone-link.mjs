#!/usr/bin/env node
// Private, temporary passenger access. Crew/admin routes are never forwarded.
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, request } from 'node:http';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const WebSocket = createRequire(new URL('../apps/hub/package.json', import.meta.url))('ws');
const WebSocketServer = WebSocket.WebSocketServer ?? WebSocket.Server;

const root = fileURLToPath(new URL('..', import.meta.url));
const cache = fileURLToPath(new URL('../.npm-cache/', import.meta.url));
const statePath = fileURLToPath(new URL('../.npm-cache/phone-link.json', import.meta.url));
const cachedBinary = fileURLToPath(new URL('../.npm-cache/cloudflared/cloudflared.exe', import.meta.url));
const binary = process.env.CLOUDFLARED_PATH ?? (process.platform === 'win32' && existsSync(cachedBinary) ? cachedBinary : 'cloudflared');
const hub = new URL(process.env.HEARME_PHONE_HUB ?? 'http://127.0.0.1:8080');
if (hub.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(hub.hostname)) throw new Error('The phone gateway must connect to a local HTTP hub.');
const port = Number(process.env.HEARME_PHONE_PORT ?? 8790);
const key = randomBytes(24).toString('hex');
const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
let publicOrigin = '';
let tunnel;
let stopping = false;
const sockets = new Set();
const cookieName = 'hearme_phone';
const postRoutes = new Set(['/api/understand', '/api/match', '/api/speech']);
let rateWindow = Date.now();
let posts = 0;

const equal = value => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(key));
const authenticated = req => Date.now() < expiresAt && equal((req.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1));
const sameOrigin = req => !req.headers.origin || req.headers.origin === publicOrigin;
function fail(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end(text);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://phone.local');
  if (url.pathname === '/phone-join' && req.method === 'GET' && equal(url.searchParams.get('key')) && Date.now() < expiresAt) {
    const seat = /^\d{1,2}[A-K]$/.test(url.searchParams.get('seat') ?? '') ? url.searchParams.get('seat') : '23C';
    res.writeHead(302, { Location: `/mobile/?seat=${seat}`, 'Set-Cookie': `${cookieName}=${key}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    return res.end();
  }
  if (!authenticated(req) || !sameOrigin(req)) return fail(res, 403, 'Open the private phone link printed by npm run phone-link.');
  if (url.pathname === '/' && req.method === 'GET') { res.writeHead(302, { Location: '/mobile/?seat=23C' }); return res.end(); }
  const asset = url.pathname.startsWith('/mobile/') && ['GET', 'HEAD'].includes(req.method);
  const readApi = req.method === 'GET' && ['/api/status', '/api/booking'].includes(url.pathname);
  const writeApi = req.method === 'POST' && postRoutes.has(url.pathname);
  if (!asset && !readApi && !writeApi) return fail(res, 404, 'Passenger access only. Crew and administration stay on the laptop.');
  if (writeApi) {
    if (Date.now() - rateWindow >= 60_000) { rateWindow = Date.now(); posts = 0; }
    if (++posts > 40) return fail(res, 429, 'Please wait a moment before another voice request.');
  }
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 1_048_576) return fail(res, 413, 'Recording is too large. Speak for up to fifteen seconds.');
      chunks.push(chunk);
    }
  } catch { return fail(res, 400, 'Could not read the request.'); }
  const body = Buffer.concat(chunks);
  const headers = {};
  for (const name of ['content-type', 'x-hearme-mode', 'x-hearme-cloud-consent']) if (req.headers[name]) headers[name] = req.headers[name];
  if (body.length) headers['content-length'] = String(body.length);
  const upstream = request(new URL(url.pathname + url.search, hub), { method: req.method, headers }, response => {
    if (url.pathname === '/api/status') {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const status = JSON.parse(data);
          status.urls = { base: publicOrigin, lan: [], passengerBase: publicOrigin, join: `${publicOrigin}/mobile/?seat=23C` };
          res.writeHead(response.statusCode ?? 502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(status));
        } catch { fail(res, 502, 'The cabin hub is not ready yet.'); }
      });
      return;
    }
    const outgoing = { 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'microphone=(self), camera=()' };
    for (const name of ['content-type', 'cache-control', 'content-length']) if (response.headers[name]) outgoing[name] = response.headers[name];
    res.writeHead(response.statusCode ?? 502, outgoing);
    response.pipe(res);
    response.on('error', () => res.destroy());
  });
  upstream.setTimeout(120_000, () => upstream.destroy(new Error('Hub timeout')));
  upstream.on('error', () => { if (!res.headersSent) fail(res, 502, 'The cabin hub is unavailable. Keep npm run hub running.'); else res.destroy(); });
  res.on('close', () => upstream.destroy());
  upstream.end(body);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://phone.local').pathname !== '/ws' || !authenticated(req) || !sameOrigin(req)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
  }
  wss.handleUpgrade(req, socket, head, client => {
    sockets.add(client);
    const upstream = new WebSocket(new URL('/ws', hub).href.replace(/^http/, 'ws'), { maxPayload: 64 * 1024 });
    let seat;
    let identified = false;
    const pending = [];
    let messages = 0;
    let since = Date.now();
    client.on('message', (data, binary) => {
      if (binary) return client.close(1008, 'Text frames only');
      if (Date.now() - since >= 60_000) { since = Date.now(); messages = 0; }
      if (++messages > 120) return client.close(1008, 'Too many requests');
      let frame;
      try { frame = JSON.parse(data.toString()); } catch { return client.close(1008, 'Invalid frame'); }
      if (frame.kind === 'hello' && frame.role === 'passenger') {
        if (frame.seat !== undefined && !/^\d{1,2}[A-K]$/.test(frame.seat)) return client.close(1008, 'Invalid seat');
        if (seat && seat !== frame.seat) return client.close(1008, 'Reconnect to change seats');
        seat = frame.seat;
        identified = true;
      } else if (!(identified && seat && frame.kind === 'cabin' && frame.msg?.seat === seat)) return client.close(1008, 'Passenger messages only');
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: false });
      else if (pending.length < 8) pending.push(data);
      else client.close(1008, 'Hub is not ready');
    });
    upstream.on('open', () => pending.splice(0).forEach(data => upstream.send(data, { binary: false })));
    upstream.on('message', (data, binary) => { if (client.readyState === WebSocket.OPEN) client.send(data, { binary }); });
    upstream.on('close', () => client.close());
    upstream.on('error', () => client.close(1011, 'Hub unavailable'));
    client.on('close', () => { sockets.delete(client); upstream.terminate(); });
    client.on('error', () => upstream.terminate());
  });
});

function stop() {
  if (stopping) return;
  stopping = true;
  tunnel?.kill();
  sockets.forEach(socket => socket.terminate());
  wss.close(); server.close();
  rmSync(statePath, { force: true });
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
mkdirSync(cache, { recursive: true });
tunnel = spawn(binary, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${port}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
function log(data) {
  const line = data.toString();
  const origin = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (origin && !publicOrigin) {
    publicOrigin = origin;
    const url = `${origin}/phone-join?key=${key}&seat=23C`;
    writeFileSync(statePath, JSON.stringify({ pid: process.pid, expiresAt, url, origin }, null, 2), { mode: 0o600 });
    console.log(`\nOpen on your phone (no certificate installation):\n${url}\n\nThis private link expires in two hours. Keep this terminal and the cabin hub running.\nPhone traffic uses Cloudflare over the internet; the crew console stays local.\n`);
  }
  if (/error|registered tunnel connection/i.test(line)) process.stderr.write(line);
}
tunnel.stdout.on('data', log); tunnel.stderr.on('data', log);
tunnel.on('error', error => { console.error(`Install cloudflared or set CLOUDFLARED_PATH: ${error.message}`); stop(); });
tunnel.on('exit', () => { if (!stopping) { console.error('Phone tunnel stopped. Run npm run phone-link to create a new link.'); stop(); } });
setTimeout(stop, Math.max(1, expiresAt - Date.now())).unref();
