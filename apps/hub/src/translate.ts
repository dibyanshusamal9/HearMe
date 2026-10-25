/**
 * Offline translation with NLLB-200 (`npm run models -- translate`, ~900 MB
 * once): the crew member's own words, when no verified reply fits. Unlike the
 * verified replies nobody has checked these, so the passenger is told the
 * message is machine-translated.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { loadTransformers } from './ai';
import { MODEL_DIR, MODEL_FILES, TRANSLATE_MODEL } from './models';

/** NLLB-200 codes for the languages HearMe reads. */
export const NLLB_CODES: Record<string, string> = {
  ja: 'jpn_Jpan',
  en: 'eng_Latn',
  hi: 'hin_Deva',
  th: 'tha_Thai',
  id: 'ind_Latn',
  vi: 'vie_Latn',
  bn: 'ben_Beng',
  ta: 'tam_Taml',
  pa: 'pan_Guru',
  mr: 'mar_Deva',
  as: 'asm_Beng',
  gu: 'guj_Gujr',
  kn: 'kan_Knda',
  ks: 'kas_Arab',
  mai: 'mai_Deva',
  ml: 'mal_Mlym',
  mni: 'mni_Beng',
  ne: 'npi_Deva',
  or: 'ory_Orya',
  sa: 'san_Deva',
  sat: 'sat_Beng',
  sd: 'snd_Arab',
  te: 'tel_Telu',
  ur: 'urd_Arab',
};

export interface Translator {
  /** `maxNewTokens` caps the output (default 96): short inputs get short caps, so nothing runs on. */
  translate(text: string, from: string, to: string, maxNewTokens?: number): Promise<string>;
}

/**
 * Keep the translation proper: stop at the first word in another script
 * (non-Latin targets) and drop words repeated back to back.
 */
export function keepTarget(text: string, script: string): string {
  const own = new RegExp(`\\p{Script=${script}}`, 'u');
  const letter = /\p{L}/u;
  const kept: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    if (script !== 'Latn' && letter.test(word) && !own.test(word)) break;
    if (word === '-' || word === kept[kept.length - 1]) continue;
    kept.push(word);
  }
  return kept.join(' ');
}

export function translationModelInstalled(): boolean {
  return MODEL_FILES[TRANSLATE_MODEL]!.every((name) => {
    const file = join(MODEL_DIR, TRANSLATE_MODEL, name);
    return existsSync(file) && statSync(file).size > 0;
  });
}

/** NLLB in a worker thread, so loading and translating never stall the hub's network handling. */
export function createWorkerTranslator(threads: number): Promise<Translator> {
  if (!translationModelInstalled()) return Promise.reject(new Error('translation model not installed: npm run models -- translate'));
  const worker = new Worker(new URL('./translateWorker.ts', import.meta.url), { workerData: { threads } });
  worker.unref();
  const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
  let next = 0;
  return new Promise<Translator>((resolve, reject) => {
    worker.on('message', (m: { kind: 'ready' } | { kind: 'failed'; error: string } | { kind: 'done'; id: number; text?: string; error?: string }) => {
      if (m.kind === 'ready')
        resolve({
          translate: (text, from, to) =>
            new Promise((res, rej) => {
              const id = next++;
              pending.set(id, { resolve: res, reject: rej });
              worker.postMessage({ id, text, from, to });
            }),
        });
      else if (m.kind === 'failed') reject(new Error(m.error));
      else {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error !== undefined) p?.reject(new Error(m.error));
        else p?.resolve(m.text ?? '');
      }
    });
    worker.on('error', (e: Error) => {
      reject(e);
      for (const p of pending.values()) p.reject(e);
      pending.clear();
    });
  });
}

export async function createNllb(threads: number): Promise<Translator> {
  if (!translationModelInstalled()) throw new Error('translation model not installed: npm run models -- translate');
  const t = await loadTransformers();
  const run = (await t.pipeline('translation', TRANSLATE_MODEL, {
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 },
  } as never)) as unknown as (texts: string[], opts: Record<string, unknown>) => Promise<{ translation_text: string }[]>;
  return {
    async translate(text, from, to, maxNewTokens = 96) {
      const src = NLLB_CODES[from];
      const tgt = NLLB_CODES[to];
      if (!src || !tgt) throw new Error(`no translation for ${from} → ${to}`);
      // One sentence at a time: batched generation runs on past the end of shorter sentences.
      const sentences = text.split(/(?<=[。！？!?])\s*/u).filter((s) => s.trim());
      const out: string[] = [];
      for (const s of sentences) {
        const [r] = await run([s], { src_lang: src, tgt_lang: tgt, max_new_tokens: maxNewTokens });
        out.push(keepTarget(r?.translation_text ?? '', tgt.split('_')[1]!));
      }
      return out.filter(Boolean).join(' ');
    },
  };
}
