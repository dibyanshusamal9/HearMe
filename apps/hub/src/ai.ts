import {
  ReplyMatcher,
  SemanticNeedMatcher,
  createKeywordMatcher,
  type Embedder,
  type LangCode,
  type MatchResult,
  type ModelState,
  type ReplyId,
} from '@hearme/shared';
import { loadNeedHead } from './head';
import { fromDevanagari, loadLanguagePacks, withLanguagePacks, type LanguagePack } from './langpacks';
import { ASR_MODELS, EMBED_MODEL, MODEL_DIR, type AsrSize } from './models';

/**
 * The crew tablet's offline AI: Whisper for speech → text and
 * multilingual-e5 for text → need / verified reply. Models load from disk
 * (download once with `npm run models`). Requests run one at a time so a
 * laptop stays responsive; nothing is written to disk.
 */

export interface Transcriber {
  /** `lang`: one of the 6 language codes, or Whisper's name for another language (e.g. "bengali"). */
  transcribe(samples: Float32Array, lang: string): Promise<string>;
  /** Frees the model's memory (used when switching models). */
  dispose?(): Promise<void>;
}

const WHISPER_LANG: Record<LangCode, string> = {
  hi: 'hindi',
  en: 'english',
  ja: 'japanese',
  th: 'thai',
  id: 'indonesian',
  vi: 'vietnamese',
};

/** Whisper invents text for silence ("Thank you." …); skip clips with no speech. */
export function hasSpeech(samples: Float32Array, sampleRate = 16000): boolean {
  return trimSilence(samples, sampleRate) !== null;
}

/**
 * The part of a clip between the first and last voiced 20 ms frame (plus a
 * quarter second either side), or null with under 0.25 s of speech. Long
 * silent tails are where Whisper hallucinates; it does not make Whisper
 * faster, which always encodes a 30 s window.
 */
export function trimSilence(samples: Float32Array, sampleRate = 16000): Float32Array | null {
  const frame = Math.round(sampleRate * 0.02);
  let voiced = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += samples[j]! * samples[j]!;
    if (Math.sqrt(sum / frame) > 0.01) {
      voiced += 1;
      if (first < 0) first = i;
      last = i + frame;
    }
  }
  if (voiced * 0.02 < 0.25) return null;
  const pad = Math.round(sampleRate * 0.25);
  return samples.subarray(Math.max(0, first - pad), Math.min(samples.length, last + pad));
}

/** Rejects when the work takes too long, so one stuck request cannot block the queue. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    work.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e: unknown) => (clearTimeout(timer), reject(e)),
    );
  });
}

export async function loadTransformers() {
  const t = await import('@huggingface/transformers');
  t.env.cacheDir = MODEL_DIR;
  t.env.localModelPath = MODEL_DIR;
  t.env.allowRemoteModels = false;
  return t;
}

export async function createWhisper(size: AsrSize, threads: number): Promise<Transcriber> {
  const t = await loadTransformers();
  const asr = await t.pipeline('automatic-speech-recognition', ASR_MODELS[size], {
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 },
  });
  return {
    async transcribe(samples, lang) {
      // Long clips are cut to 20 s: requests are short, and this bounds the work per request.
      const clip = samples.length > 16000 * 20 ? samples.subarray(0, 16000 * 20) : samples;
      const out = (await asr(clip, { language: WHISPER_LANG[lang as LangCode] ?? lang, task: 'transcribe', max_new_tokens: 64 })) as { text: string };
      return out.text.trim();
    },
    dispose: () => asr.dispose(),
  };
}

export async function createE5(threads: number): Promise<Embedder> {
  const t = await loadTransformers();
  const extractor = await t.pipeline('feature-extraction', EMBED_MODEL, {
    dtype: 'q8',
    session_options: { intraOpNumThreads: Math.min(2, threads), interOpNumThreads: 1 },
  });
  return {
    async embed(texts, kind) {
      const out: Float32Array[] = [];
      // Small batches keep memory flat while the index is built.
      for (let i = 0; i < texts.length; i += 32) {
        const batch = texts.slice(i, i + 32).map((x) => `${kind}: ${x}`);
        const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
        const [rows, dims] = tensor.dims as [number, number];
        const data = tensor.data as Float32Array;
        for (let r = 0; r < rows; r++) out.push(data.slice(r * dims, (r + 1) * dims));
      }
      return out;
    },
  };
}

export interface AiStatus {
  asr: { model: string; state: ModelState; error?: string };
  embed: { model: string; state: ModelState; error?: string };
}

export interface AiEngineOptions {
  asrSize: AsrSize;
  threads: number;
  /** Factories are injectable for tests. */
  loadAsr?: () => Promise<Transcriber>;
  loadEmbedder?: () => Promise<Embedder>;
}

export class AiEngine {
  private asr: Transcriber | null = null;
  private needs: SemanticNeedMatcher | null = null;
  private replies: ReplyMatcher | null = null;
  private packs = loadLanguagePacks();
  private keyword = createKeywordMatcher(withLanguagePacks(undefined, this.packs));
  private embedder: Embedder | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private asrFailures = 0;
  readonly status: AiStatus;

  constructor(private options: AiEngineOptions) {
    this.status = {
      asr: { model: ASR_MODELS[options.asrSize], state: 'off' },
      embed: { model: EMBED_MODEL, state: 'off' },
    };
  }

  /** Load models one after the other (lower peak memory). Never throws. */
  async start(): Promise<void> {
    this.status.embed.state = 'loading';
    try {
      const embedder = await (this.options.loadEmbedder ?? (() => createE5(this.options.threads)))();
      this.embedder = embedder;
      this.needs = await SemanticNeedMatcher.create(embedder, withLanguagePacks(undefined, this.packs), loadNeedHead());
      this.replies = await ReplyMatcher.create(embedder);
      this.status.embed.state = 'ready';
    } catch (e) {
      this.status.embed = { ...this.status.embed, state: 'error', error: String(e) };
    }
    this.status.asr.state = 'loading';
    try {
      this.asr = await (this.options.loadAsr ?? (() => createWhisper(this.options.asrSize, this.options.threads)))();
      if (process.env.HEARME_NO_WARMUP !== '1') await this.warmUp();
      this.status.asr.state = 'ready';
    } catch (e) {
      this.status.asr = { ...this.status.asr, state: 'error', error: String(e) };
    }
  }

  /** Time the last warm-up took (ms), for the start-up banner. */
  warmupMs: number | null = null;

  /**
   * One throwaway run of each model before the first passenger: ONNX does
   * one-off work (graph optimisation, memory allocation) on its first call.
   */
  private async warmUp(): Promise<void> {
    const t0 = Date.now();
    const tone = Float32Array.from({ length: 16000 }, (_, i) => 0.05 * Math.sin(i / 7));
    await this.asr?.transcribe(tone, 'en').catch(() => '');
    await this.needs?.match('water').catch(() => undefined);
    await this.replies?.match('すぐお持ちします').catch(() => undefined);
    this.warmupMs = Date.now() - t0;
  }

  get canTranscribe(): boolean {
    return this.asr !== null;
  }

  get asrSize(): AsrSize {
    return this.options.asrSize;
  }

  /**
   * Speech → text. Throws if the speech model is not available. After two
   * failures in a row the model is reloaded in the background; meanwhile
   * passengers can still tap and type.
   */
  /** Language packs in use (data/languages/*.json). */
  languagePacks(): LanguagePack[] {
    return this.packs;
  }

  /** Re-read the language packs and the trained classifier without restarting (after npm run add-language). */
  async reloadLanguages(): Promise<void> {
    const packs = loadLanguagePacks();
    const needs = withLanguagePacks(undefined, packs);
    if (this.embedder) this.needs = await SemanticNeedMatcher.create(this.embedder, needs, loadNeedHead());
    this.keyword = createKeywordMatcher(needs);
    this.packs = packs;
  }

  async transcribe(samples: Float32Array, lang: string): Promise<string> {
    const asr = this.asr;
    if (!asr) throw new Error('speech model not loaded');
    const voiced = trimSilence(samples);
    if (!voiced) return '';
    try {
      const pack = this.packs.find((p) => p.code === lang);
      const text = await this.serial(() => withTimeout(asr.transcribe(voiced, pack?.whisper ?? lang), 30_000));
      this.asrFailures = 0;
      return fromDevanagari(text, pack?.script);
    } catch (e) {
      if (++this.asrFailures >= 2) void this.loadAsr(this.options.asrSize);
      throw e;
    }
  }

  /**
   * Switch the speech model (small: more accurate, base: about 4× faster)
   * without restarting. The current model keeps working until the new one is
   * ready, and stays if the new one cannot load.
   */
  async switchAsr(size: AsrSize): Promise<void> {
    if (size === this.options.asrSize && this.asr) return;
    await this.loadAsr(size);
  }

  private async loadAsr(size: AsrSize): Promise<void> {
    this.asrFailures = 0;
    const previous = this.asr;
    const previousSize = this.options.asrSize;
    this.status.asr = { model: ASR_MODELS[size], state: 'loading' };
    try {
      const load = this.options.loadAsr && size === previousSize ? this.options.loadAsr : () => createWhisper(size, this.options.threads);
      const next = await load();
      this.asr = next;
      this.options.asrSize = size;
      this.status.asr = { model: ASR_MODELS[size], state: 'ready' };
      if (previous && previous !== next) await previous.dispose?.().catch(() => undefined);
    } catch (e) {
      this.status.asr = previous
        ? { model: ASR_MODELS[previousSize], state: 'ready', error: `could not load ${ASR_MODELS[size]}: ${String(e)}` }
        : { model: ASR_MODELS[size], state: 'error', error: String(e) };
    }
  }

  /** Text → need. Uses meaning-based matching when the embedding model is ready, else (or if it fails) keywords. */
  matchNeeds(text: string): Promise<MatchResult> {
    const needs = this.needs;
    if (!needs) return Promise.resolve(this.keyword.match(text));
    return this.serial(() => withTimeout(needs.match(text), 10_000)).catch(() => this.keyword.match(text));
  }

  /** Crew speech → closest verified reply (null when unsure or unavailable). */
  async matchReply(text: string): Promise<{ replyId: ReplyId | null; confidence: number }> {
    const replies = this.replies;
    if (!replies || !text.trim()) return { replyId: null, confidence: 0 };
    const r = await this.serial(() => replies.match(text));
    return { replyId: r.replyId, confidence: r.confidence };
  }

  private serial<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
