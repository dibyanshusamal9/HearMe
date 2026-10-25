/**
 * One-time download of the offline models into apps/hub/.models (git-ignored).
 * After this the hub needs no internet. Usage:
 *   npm run models            # whisper-small + e5 (default)
 *   npm run models -- base    # whisper-base + e5 (lighter)
 *   npm run models -- all     # both whisper sizes + e5
 *   npm run models -- translate # NLLB for crew replies and language-pack drafts
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ASR_MODELS, EMBED_MODEL, MODEL_DIR, MODEL_FILES, TRANSLATE_MODEL, asrSizeFromEnv } from '../models';

const arg = process.argv[2];
// all: both Whisper sizes + e5 · translate: NLLB for crew replies and language packs (~900 MB)
const repos =
  arg === 'translate'
    ? [TRANSLATE_MODEL]
    : arg === 'all'
      ? [ASR_MODELS.small, ASR_MODELS.base, EMBED_MODEL]
      : [ASR_MODELS[arg === 'base' || arg === 'small' ? arg : asrSizeFromEnv()], EMBED_MODEL];

for (const repo of repos) {
  for (const file of MODEL_FILES[repo] ?? []) {
    const target = join(MODEL_DIR, repo, file);
    if (existsSync(target) && statSync(target).size > 0) {
      console.log(`✓ ${repo}/${file}`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    const url = `https://huggingface.co/${repo}/resolve/main/${file}`;
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
    const total = Number(res.headers.get('content-length') ?? 0);
    process.stdout.write(`↓ ${repo}/${file}${total ? ` (${(total / 1e6).toFixed(0)} MB)` : ''} … `);
    const tmp = `${target}.part`;
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
    renameSync(tmp, target);
    console.log('done');
  }
}
console.log(`Models are in ${MODEL_DIR}`);
