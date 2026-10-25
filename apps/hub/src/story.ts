import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LangCode } from '@hearme/shared';
import { STORY_SENTENCES } from '@hearme/shared/lab';
import { encodeWav } from './audio';

/*
 * Sharda's sentence for the scripted demo on the stage ("I need hot water for
 * my medicine"; STORY_SENTENCES). The stage plays a recording of it out loud
 * and sends the same recording through the real pipeline (Whisper → e5 on
 * this hub), so the story runs live but never depends on the room's
 * microphone. Where the recording comes from:
 *
 *  1. data/story/<lang>.wav: a real person's recording (saved from the
 *     voice lab, or added by hand), committed with the repo.
 *  2. otherwise macOS `say` makes one once (cached in .cache/).
 *  3. otherwise none: the story types the sentence instead.
 */

const SAY_VOICES: Partial<Record<LangCode, string>> = { hi: 'Lekha' };

const HUB_DIR = fileURLToPath(new URL('../', import.meta.url));
/** Where recordings of the story sentence live (HEARME_STORY_DIR, or data/story in the repo). */
export const storyDir = (): string => process.env.HEARME_STORY_DIR ?? join(HUB_DIR, 'data', 'story');
const CACHE_DIR = join(HUB_DIR, '.cache');

export type StoryVoiceSource = 'recorded' | 'synthesized';

export function storyVoicePath(lang: LangCode): string {
  return join(storyDir(), `${lang}.wav`);
}

/** The recording for the story in this language, or null when there is none and none can be made here. */
export function storyVoice(lang: LangCode): { wav: Buffer; source: StoryVoiceSource } | null {
  const recorded = storyVoicePath(lang);
  if (existsSync(recorded)) return { wav: readFileSync(recorded), source: 'recorded' };
  const cached = join(CACHE_DIR, `story-${lang}.wav`);
  if (existsSync(cached)) return { wav: readFileSync(cached), source: 'synthesized' };
  const sentence = STORY_SENTENCES[lang]?.text;
  const voice = SAY_VOICES[lang];
  if (!sentence || !voice || process.platform !== 'darwin') return null;
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const aiff = join(CACHE_DIR, `story-${lang}.aiff`);
    execFileSync('say', ['-v', voice, '-o', aiff, sentence], { timeout: 20_000 });
    // 16 kHz mono PCM, with a little silence either side, like someone pressing the mic and then speaking.
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', aiff, '-af', 'adelay=300,apad=pad_dur=0.6', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', cached], { timeout: 20_000 });
    rmSync(aiff, { force: true });
    return { wav: readFileSync(cached), source: 'synthesized' };
  } catch {
    return null;
  }
}

/** Keep a voice lab take as the story's recording (16 kHz samples). */
export function saveStoryVoice(lang: LangCode, samples: Float32Array): string {
  mkdirSync(storyDir(), { recursive: true });
  const file = storyVoicePath(lang);
  writeFileSync(file, encodeWav(samples));
  return file;
}
