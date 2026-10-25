/**
 * A small trained layer on top of multilingual-e5: one weight vector per need,
 * learned from thousands of generated cabin requests (catalogue phrases inside
 * request templates in 6 languages, plus Whisper-style misspellings). It turns
 * an e5 sentence vector into a probability for each need.
 *
 * Trained on the hub with `npm run train -w @hearme/hub`; the weights ship in
 * apps/hub/data/need-head.json. Pure arithmetic, no dependencies.
 */
import { semanticConfidence } from './semantic';

export interface NeedHeadWeights {
  /** Embedding model the head was trained on (vectors from another model are meaningless to it). */
  model: string;
  labels: string[];
  /** One row per label, one column per embedding dimension. */
  weights: number[][];
  bias: number[];
  trainedOn: number;
  at: string;
}

export interface HeadProbability {
  id: string;
  p: number;
}

export class NeedHead {
  constructor(readonly params: NeedHeadWeights) {}

  /** Probability per need for one e5 query vector, most likely first. */
  predict(v: Float32Array): HeadProbability[] {
    const { labels, weights, bias } = this.params;
    const logits = labels.map((_, k) => {
      const row = weights[k]!;
      let s = bias[k]!;
      for (let i = 0; i < row.length; i++) s += row[i]! * v[i]!;
      return s;
    });
    const max = Math.max(...logits);
    const exp = logits.map((x) => Math.exp(x - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return labels.map((id, k) => ({ id, p: exp[k]! / sum })).sort((a, b) => b.p - a.p);
  }
}

/**
 * The head ranks the needs and nearest-example similarity checks it: when
 * both pick the same need the stronger confidence counts, when they disagree
 * the weaker one, so a disagreement ends in "Did you mean?" pictures.
 * Chosen over the head alone on held-out phrases and saved Whisper
 * transcripts (train-head.ts prints the comparison).
 */
export function headSignal(
  ranked: { id: string; score: number }[],
  probs: HeadProbability[],
): { ranked: { id: string; score: number }[]; confidence: number } {
  const nearest = semanticConfidence(ranked);
  const top = probs[0];
  if (!top) return { ranked, confidence: nearest };
  const confidence = top.id === ranked[0]?.id ? Math.max(top.p, nearest) : Math.min(top.p, nearest);
  return { ranked: probs.map((x) => ({ id: x.id, score: x.p })), confidence: Math.round(confidence * 100) / 100 };
}
