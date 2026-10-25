import { fileURLToPath } from 'node:url';

/**
 * The offline AI models the hub runs (downloaded once with `npm run models`,
 * then loaded from disk with no internet).
 *
 *  - Speech → text: Whisper (multilingual). `small` is accurate for Hindi,
 *    Japanese and Thai but needs ~1 GB RAM and 2–4 s per request on a laptop
 *    CPU; `base` is ~3× faster and lighter but weaker (it often writes Hindi in
 *    Urdu script). Choose with HEARME_ASR_MODEL=small|base (default: small).
 *  - Text → need: multilingual-e5-small sentence embeddings.
 */
export const MODEL_DIR = fileURLToPath(new URL('../.models/', import.meta.url));

export const ASR_MODELS = {
  small: 'onnx-community/whisper-small',
  base: 'onnx-community/whisper-base',
} as const;
export type AsrSize = keyof typeof ASR_MODELS;

export const EMBED_MODEL = 'Xenova/multilingual-e5-small';

/**
 * Offline translation (NLLB-200): crew own-word replies and language-pack drafts.
 * Crew preview each translation before sending; passenger messages are labelled
 * as machine translations, separately from the verified reply templates.
 */
export const TRANSLATE_MODEL = 'Xenova/nllb-200-distilled-600M';

const WHISPER_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

/** Files each model needs, relative to its repo root on huggingface.co. */
export const MODEL_FILES: Record<string, string[]> = {
  [ASR_MODELS.small]: WHISPER_FILES,
  [ASR_MODELS.base]: WHISPER_FILES,
  [EMBED_MODEL]: ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'],
  [TRANSLATE_MODEL]: [
    'config.json',
    'generation_config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'onnx/encoder_model_quantized.onnx',
    'onnx/decoder_model_merged_quantized.onnx',
  ],
};

export function asrSizeFromEnv(value = process.env.HEARME_ASR_MODEL): AsrSize {
  return value === 'base' ? 'base' : 'small';
}

/** Threads for ONNX inference. Default 4 (laptop performance cores); keep it low so the demo laptop stays responsive. */
export function inferenceThreads(value = process.env.HEARME_THREADS): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 16 ? n : 4;
}
