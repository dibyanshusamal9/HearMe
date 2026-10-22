#!/usr/bin/env node
/**
 * One command for the whole demo:  npm run demo
 *   1. downloads the offline AI models the first time (≈480 MB, then never again)
 *   2. builds the phone app + web apps if they are missing (or with --rebuild)
 *   3. starts the cabin hub and opens the demo stage in your browser
 * Flags: --rebuild  --no-open  --no-ai (skip the speech models; taps/typing still work)
 *        --check   only check that everything the demo needs is in place (run it before you present)
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Windows: Node runs .cmd files only through a shell (EINVAL since the CVE-2024-27980 fix), and then wants one
// command string rather than an argument list (DEP0190). The arguments here are fixed words.
const shell = process.platform === 'win32';
const npmCommand = (npmArgs) => (shell ? [`${npm} ${npmArgs.join(' ')}`, []] : [npm, npmArgs]);
const run = (script, extra = []) => {
  const r = spawnSync(...npmCommand(['run', script, ...extra]), { cwd: root, stdio: 'inherit', shell });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (args.includes('--check')) process.exit(await preflight());

const noAi = args.includes('--no-ai');
const modelsReady = existsSync(new URL('../apps/hub/.models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx', import.meta.url));
if (!noAi && !modelsReady) {
  console.log('\n▶ First run: downloading the offline AI models (≈480 MB, one time)…');
  run('models', ['--', 'all']); // Whisper-small, Whisper-base (the stage's fast mode) and e5
}

const built = existsSync(new URL('../apps/ife/dist/index.html', import.meta.url)) && existsSync(new URL('../apps/ife/dist/mobile/index.html', import.meta.url));
if (!built || args.includes('--rebuild')) {
  console.log('\n▶ Building the phone app and the web apps…');
  run('build');
}

console.log('\n▶ Starting the cabin hub…');
const hubArgs = ['run', 'start', '-w', '@hearme/hub', '--', ...(args.includes('--no-open') ? [] : ['--open'])];
const hub = spawn(...npmCommand(hubArgs), { cwd: root, stdio: 'inherit', shell, env: { ...process.env, ...(noAi ? { HEARME_NO_AI: '1' } : {}) } });
hub.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => hub.kill(sig));

/** Everything the demo needs, checked without starting it. Returns the exit code. */
async function preflight() {
  const ok = (good, label, fix = '') => {
    console.log(`${good ? '  ✓' : '  ✗'} ${label}${!good && fix ? `  →  ${fix}` : ''}`);
    return good;
  };
  const hub = (p) => new URL(`../apps/hub/${p}`, import.meta.url);
  const onnx = (dir) => existsSync(hub(dir)) && readdirSync(hub(dir)).filter((f) => f.endsWith('.onnx')).length > 0;
  const size = process.env.HEARME_ASR_MODEL === 'base' ? 'base' : 'small';
  const portFree = (port) =>
    new Promise((resolve) => {
      const srv = createServer().once('error', () => resolve(false));
      srv.listen(port, () => srv.close(() => resolve(true)));
    });
  const running = await fetch('http://localhost:8080/api/status').then((r) => r.json()).catch(() => null);
  // Same preference as apps/hub/src/net.ts: HEARME_HOST, then Wi-Fi, then wired, virtual adapters (VirtualBox, WSL, VPNs) last.
  const VIRTUAL = /vethernet|virtualbox|vbox|vmware|vmnet|hyper-v|wsl|docker|^br-|^veth|utun|tailscale|zerotier/i;
  const WIRELESS = /wi-?fi|wlan|wireless|^wl|^en0$/i;
  const rank = ([name, a]) => (VIRTUAL.test(name) || a.address.startsWith('192.168.56.') ? 2 : WIRELESS.test(name) ? 0 : 1);
  const found = Object.entries(networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).filter((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')).map((a) => [name, a]))
    .sort((x, y) => rank(x) - rank(y));
  const lan = process.env.HEARME_HOST ? { address: process.env.HEARME_HOST } : found[0]?.[1];
  const install = (mac, win) => (process.platform === 'win32' ? win : mac);
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

  console.log('\nHearMe demo check\n');
  const required = [
    ok(Number(process.versions.node.split('.')[0]) >= 20, `Node ${process.versions.node}`, 'install Node 20 or newer'),
    ok(onnx('.models/Xenova/multilingual-e5-small/onnx'), 'meaning model (multilingual-e5-small)', 'npm run models'),
    ok(onnx(`.models/onnx-community/whisper-${size}/onnx`), `speech model (whisper-${size})`, size === 'base' ? 'npm run models -- base' : 'npm run models'),
    ok(existsSync(hub('data/need-head.json')), 'trained need classifier (data/need-head.json)', 'npm run train -w @hearme/hub'),
    ok(existsSync(new URL('../apps/ife/dist/index.html', import.meta.url)) && existsSync(new URL('../apps/ife/dist/mobile/index.html', import.meta.url)), 'apps built', 'npm run build'),
    running ? ok(true, `hub already running (speech: ${running.asr?.state}, meaning: ${running.embed?.state})`) : ok((await portFree(8080)) && (await portFree(8443)), 'ports 8080 and 8443 free', 'stop whatever uses them'),
  ];
  ok(!!lan, lan ? `Wi-Fi address ${lan.address}: phones scan the QR at http://${lan.address}:8080/join (set HEARME_HOST to pick another address)` : 'no Wi-Fi/LAN address (phones cannot join; the stage still works)', 'connect to a network or a phone hotspot');
  ok(ffmpeg, 'ffmpeg (only for native-app audio formats)', install('brew install ffmpeg', 'winget install ffmpeg'));
  const mkcert = spawnSync('mkcert', ['-CAROOT'], { encoding: 'utf8' });
  const ip = lan ? lan.address : '<laptop-ip>';
  if (process.env.HEARME_TLS_CERT) ok(true, 'HTTPS: your own certificate (HEARME_TLS_CERT): nothing for phones to install');
  else if (mkcert.status === 0) ok(true, `HTTPS: mkcert's CA (${mkcert.stdout.trim()}): phones trust it once at http://${ip}:8080/trust`);
  else ok(true, `HTTPS: built-in local CA: phones trust it once at http://${ip}:8080/trust  (optional: ${install('brew install mkcert', 'winget install FiloSottile.mkcert')})`);
  const fine = required.every(Boolean);
  console.log(fine ? '\nReady: npm run demo\n' : '\nFix the ✗ lines above, then run the check again.\n');
  return fine ? 0 : 1;
}
