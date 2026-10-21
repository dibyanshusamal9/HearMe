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
const run = (script, extra = []) => {
  const r = spawnSync(npm, ['run', script, ...extra], { cwd: root, stdio: 'inherit' });
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
const hub = spawn(npm, hubArgs, { cwd: root, stdio: 'inherit', env: { ...process.env, ...(noAi ? { HEARME_NO_AI: '1' } : {}) } });
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
  const lan = Object.values(networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal);
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
  ok(!!lan, lan ? `Wi-Fi address ${lan.address}: phones open https://${lan.address}:8443/mobile/` : 'no Wi-Fi/LAN address (phones cannot join; the stage still works)', 'connect to a network or a phone hotspot');
  ok(ffmpeg, 'ffmpeg (only for native-app audio formats)', 'brew install ffmpeg');
  const mkcert = spawnSync('mkcert', ['-CAROOT'], { stdio: 'ignore' }).status === 0;
  ok(mkcert, mkcert ? 'mkcert: phones trust the hub after a one-time install (open /trust on the phone)' : 'mkcert (optional): without it phones show a certificate warning once', 'brew install mkcert');
  ok(existsSync(hub('.cert')), 'HTTPS certificate for phones', 'created on first start');
  const fine = required.every(Boolean);
  console.log(fine ? '\nReady: npm run demo\n' : '\nFix the ✗ lines above, then run the check again.\n');
  return fine ? 0 : 1;
}
