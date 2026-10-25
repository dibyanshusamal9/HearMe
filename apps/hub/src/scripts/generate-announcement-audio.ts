/** Build-time recordings of the fixed public catalogue. Never handles passenger text. */
import { ANNOUNCEMENTS, LANGUAGES, isOnlineLangCode } from '@hearme/shared';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OnlineVoice } from '../online/voice';
import { onlineConfig } from '../online/config';

try { loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url))); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const output = fileURLToPath(new URL('../../../mobile/public/announcements/', import.meta.url));
const cache = fileURLToPath(new URL('../../../../.npm-cache/', import.meta.url));
const manifestPath = join(output, 'manifest.json');
type Entry = { id: string; lang: string; textHash: string; provider: string; voice: string };
let prior: Entry[] = [];
try { prior = JSON.parse(readFileSync(manifestPath, 'utf8')).recordings as Entry[]; } catch { /* first export */ }
const entries = new Map(prior.map(entry => [`${entry.id}/${entry.lang}`, entry]));
const voice = new OnlineVoice({ ...onlineConfig(), timeoutMs: 30_000 });
const asian: { id: string; lang: string; text: string; path: string; textHash: string }[] = [];
mkdirSync(cache, { recursive: true });
mkdirSync(output, { recursive: true });
function saveManifest() {
  writeFileSync(manifestPath, JSON.stringify({ description: 'Bundled fixed announcement recordings; no live passenger data. Regenerate when captions change.', recordings: [...entries.values()].sort((a, b) => `${a.id}/${a.lang}`.localeCompare(`${b.id}/${b.lang}`)) }, null, 2) + '\n');
}

// Generate Bulbul recordings serially within each batch; its adapter limits concurrent calls.
const indian: (() => Promise<void>)[] = [];
for (const announcement of ANNOUNCEMENTS) {
  for (const language of LANGUAGES) {
    const text = announcement.text[language.code];
    if (!text) throw new Error(`Missing caption ${announcement.id}/${language.code}`);
    const key = `${announcement.id}/${language.code}`;
    const path = join(output, announcement.id, `${language.code}.mp3`);
    const textHash = createHash('sha256').update(text).digest('hex');
    if (!process.argv.includes('--force') && existsSync(path) && entries.get(key)?.textHash === textHash) continue;
    if (!isOnlineLangCode(language.code)) {
      asian.push({ id: announcement.id, lang: language.code, text, path, textHash });
      continue;
    }
    indian.push(async () => {
      let audio: Buffer | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { audio = await voice.synthesize(text, language.code); break; }
        catch (error) {
          if (attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
        }
      }
      if (!audio) throw new Error(`Could not create recording ${key}`);
      mkdirSync(join(output, announcement.id), { recursive: true });
      writeFileSync(`${path}.partial`, audio);
      renameSync(`${path}.partial`, path);
      entries.set(key, { id: announcement.id, lang: language.code, textHash, provider: 'Sarvam Bulbul v3', voice: 'simran' });
      saveManifest();
      console.log(`Recorded ${key}`);
    });
  }
}

async function generateAsian() {
  if (!asian.length) return;
  const jobs = join(cache, 'announcement-recording-jobs.json');
  const result = join(cache, 'announcement-recording-results.json');
  writeFileSync(jobs, JSON.stringify(asian));
  const env: NodeJS.ProcessEnv = { PYTHONUTF8: '1' };
  for (const name of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  env.PYTHONPATH = [join(cache, 'voice-generator'), process.env.PYTHONPATH].filter(Boolean).join(delimiter);
  let generationError: unknown;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.HEARME_PYTHON ?? 'python', [fileURLToPath(new URL('../../../../scripts/generate-announcement-audio.py', import.meta.url)), jobs, result], { env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Asian-language recording generation failed.')));
  }).catch(error => { generationError = error; });
  const results = JSON.parse(readFileSync(result, 'utf8')) as { id: string; lang: string; voice: string }[];
  for (const entry of results) {
    const job = asian.find(job => job.id === entry.id && job.lang === entry.lang);
    if (!job || !existsSync(job.path)) continue;
    entries.set(`${entry.id}/${entry.lang}`, { id: entry.id, lang: entry.lang, textHash: job.textHash, provider: 'Microsoft Edge TTS (build-time only)', voice: entry.voice });
  }
  saveManifest();
  if (generationError) throw generationError;
}

let failures: PromiseSettledResult<void>[] = [];
try {
  failures = await Promise.allSettled([
    generateAsian(),
    (async () => {
      for (let index = 0; index < indian.length; index += 2) await Promise.all(indian.slice(index, index + 2).map(generate => generate()));
    })(),
  ]);
} finally {
  saveManifest();
}
const failure = failures.find(result => result.status === 'rejected');
if (failure?.status === 'rejected') throw failure.reason;
console.log(`Announcement recordings saved in ${output}`);
