#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
try { loadEnvFile(new URL('../.env', import.meta.url)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const args = process.argv.slice(2);
const shell = process.platform === 'win32';
const command = (words) => shell ? [`npm.cmd ${words.join(' ')}`, []] : ['npm', words];
const built = existsSync(new URL('../apps/ife/dist/index.html', import.meta.url)) && existsSync(new URL('../apps/ife/dist/mobile/index.html', import.meta.url));
if (args.includes('--check')) {
  const checks = [
    [Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22 or newer'],
    [!!process.env.SARVAM_API_KEY, 'SARVAM_API_KEY configured'],
    [!!process.env.GROQ_API_KEY, 'GROQ_API_KEY configured'],
    [built, 'Web and mobile builds present (npm run build)'],
  ];
  checks.forEach(([ok, label]) => console.log(`${ok ? 'OK' : 'MISSING'} ${label}`));
  console.log('This checks configuration only. Credentials and provider access are verified on first use. No model weights are downloaded.');
  process.exit(checks.every(([ok]) => ok) ? 0 : 1);
}
if (!built || args.includes('--rebuild')) {
  const build = spawnSync(...command(['run', 'build']), { cwd: root, stdio: 'inherit', shell });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
if (!process.env.SARVAM_API_KEY || !process.env.GROQ_API_KEY) console.warn('Add SARVAM_API_KEY and GROQ_API_KEY to .env to enable Online mode. Offline workflows are independent of these keys.');
const hub = spawn(...command(['run', 'start', '-w', '@hearme/hub']), { cwd: root, stdio: 'inherit', shell, env: process.env });
console.log('HearMe: http://localhost:8080/ · Demo: http://localhost:8080/#/stage · Select Online or Offline mode in the app.');
hub.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => hub.kill(signal));
