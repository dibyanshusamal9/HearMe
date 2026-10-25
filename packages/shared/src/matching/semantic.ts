import { NEEDS } from '../catalog/needs';
import { headSignal, type NeedHead } from './head';
import { REPLIES } from '../catalog/replies';
import type { Need, ReplyId } from '../types';
import { CONFIDENCE_THRESHOLD, createKeywordMatcher, type MatchCandidate, type MatchResult } from './matcher';

/**
 * Meaning-based matching with sentence embeddings (multilingual-e5 on the hub).
 *
 * Each need is described by its label in all six languages plus its matching
 * phrases. A transcript is embedded once and compared with every description;
 * the need with the closest description wins. Because the model is
 * multilingual, "मुझे गरम पानी चाहिए", "お湯をください" and an imperfect
 * transcript like "گرم پانی" all land near "Hot water".
 *
 * The keyword matcher still runs: exact phrases are cheap and very reliable,
 * and it detects purposes ("for medicine"). The two are combined below.
 */

/** Embeds texts into unit-length vectors. e5 needs "query: " / "passage: " prefixes, added by the implementation. */
export interface Embedder {
  embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]>;
}

export interface SemanticIndex<Id extends string> {
  /** One entry per description: which item it describes and its vector. */
  owners: Id[];
  vectors: Float32Array[];
}

/**
 * Calibration: cosine similarity → confidence. multilingual-e5 scores are
 * compressed: on our 144-phrase evaluation set the correct need scores a
 * median 0.876 and the best wrong need 0.863, so confidence blends how close
 * the best match is with how far ahead of the runner-up it is. Values chosen
 * by the sweep in apps/hub `npm run eval` (keep "wrong but sent without
 * asking" ≤ 2%, then ask with pictures as rarely as possible).
 */
export const SEMANTIC_CALIBRATION = {
  /** Similarity at which absolute closeness starts to count. */
  floor: 0.83,
  /** Similarity treated as certain. */
  ceiling: 0.92,
  /** Lead over the runner-up treated as decisive. */
  decisiveMargin: 0.03,
};

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

function needDescriptions(need: Need): string[] {
  const texts = new Set<string>();
  for (const label of Object.values(need.label)) texts.add(label);
  for (const list of Object.values(need.phrases)) for (const p of list ?? []) texts.add(p);
  return [...texts];
}

export async function buildNeedIndex(embedder: Embedder, needs: Need[] = NEEDS): Promise<SemanticIndex<string>> {
  const owners: string[] = [];
  const texts: string[] = [];
  for (const need of needs) {
    for (const d of needDescriptions(need)) {
      owners.push(need.id);
      texts.push(d);
    }
  }
  return { owners, vectors: await embedder.embed(texts, 'passage') };
}

export async function buildReplyIndex(embedder: Embedder): Promise<SemanticIndex<ReplyId>> {
  const owners: ReplyId[] = [];
  const texts: string[] = [];
  for (const r of REPLIES) {
    const descriptions = new Set<string>([...Object.values(r.text), ...(r.crewSays ?? [])]);
    for (const d of descriptions) {
      owners.push(r.id);
      texts.push(d);
    }
  }
  return { owners, vectors: await embedder.embed(texts, 'passage') };
}

/** Best similarity per item, best first. */
export function rankByIndex<Id extends string>(index: SemanticIndex<Id>, query: Float32Array): { id: Id; score: number }[] {
  const best = new Map<Id, number>();
  index.vectors.forEach((v, i) => {
    const id = index.owners[i]!;
    const s = dot(v, query);
    if (s > (best.get(id) ?? -Infinity)) best.set(id, s);
  });
  return [...best.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

export function semanticConfidence(ranked: { score: number }[]): number {
  const top = ranked[0]?.score ?? 0;
  const second = ranked[1]?.score ?? 0;
  const { floor, ceiling, decisiveMargin } = SEMANTIC_CALIBRATION;
  const closeness = Math.max(0, Math.min(1, (top - floor) / (ceiling - floor)));
  const lead = Math.max(0, Math.min(1, (top - second) / decisiveMargin));
  return Math.round(Math.min(0.99, 0.55 * closeness + 0.45 * lead) * 100) / 100;
}


/**
 * Combine keyword and meaning-based results:
 *  - a confident exact phrase match wins (and gets a small boost if meaning agrees)
 *  - when both agree on the top need, confidence is the stronger of the two plus a bonus
 *  - otherwise the meaning-based ranking decides, and the "Did you mean?"
 *    options mix both rankings so the right picture is very likely among the three
 */
/** Meaning-model confidence at which it may overrule a keyword match (send → ask). */
export const DISAGREEMENT = 0.35;

export function combineMatches(kw: MatchResult, sem: { ranked: { id: string; score: number }[]; confidence: number }, disagreement = DISAGREEMENT): MatchResult {
  const semTop = sem.ranked[0]?.id;
  const kwTop = kw.candidates[0]?.needId;
  const semCandidates: MatchCandidate[] = sem.ranked.slice(0, 5).map((r) => ({ needId: r.id, score: Math.round(r.score * 1000) / 1000 }));

  const word = kw.matchedWord ? { matchedWord: kw.matchedWord } : {};
  if (kwTop && kw.confidence >= CONFIDENCE_THRESHOLD) {
    // A keyword says one thing, the meaning model fairly surely another ("heat some water" has
    // the word "water"): show both as pictures rather than send the wrong one.
    if (semTop && semTop !== kwTop && sem.confidence >= disagreement) {
      return {
        candidates: mergeCandidates(kw.candidates, semCandidates),
        confidence: round(Math.min(kw.confidence, CONFIDENCE_THRESHOLD - 0.01)),
        purposeId: kw.purposeId,
        evidence: 'disagree',
        ...word,
      };
    }
    const boost = kwTop === semTop ? 0.05 : 0;
    return { ...kw, confidence: Math.min(0.99, kw.confidence + boost), evidence: kwTop === semTop ? 'both_agree' : kw.evidence };
  }
  if (kwTop && kwTop === semTop) {
    const confidence = Math.min(0.99, Math.max(kw.confidence, sem.confidence) + 0.1);
    return { candidates: mergeCandidates(kw.candidates, semCandidates), confidence: round(confidence), purposeId: kw.purposeId, evidence: 'both_agree', ...word };
  }
  // They disagree: the more certain of the two leads the options.
  if (kwTop && kw.confidence > sem.confidence) {
    return { candidates: mergeCandidates(kw.candidates, semCandidates), confidence: kw.confidence, purposeId: kw.purposeId, evidence: semTop ? 'disagree' : kw.evidence, ...word };
  }
  const merged = mergeCandidates(semCandidates, kw.candidates);
  // The meaning model is leading and the words contributed nothing: say so.
  return { candidates: merged, confidence: sem.confidence, purposeId: kw.purposeId, evidence: kwTop ? 'disagree' : semTop ? 'meaning' : 'nothing', ...word };
}

function mergeCandidates(first: MatchCandidate[], second: MatchCandidate[]): MatchCandidate[] {
  const out: MatchCandidate[] = [];
  const seen = new Set<string>();
  const a = [...first];
  const b = [...second];
  // Interleave so both rankings contribute to the top three options.
  while (a.length || b.length) {
    for (const list of [a, b]) {
      const c = list.shift();
      if (c && !seen.has(c.needId)) {
        seen.add(c.needId);
        out.push(c);
      }
    }
  }
  return out;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Matches passenger text to needs using keywords + embeddings. */
export class SemanticNeedMatcher {
  private constructor(
    private embedder: Embedder,
    private index: SemanticIndex<string>,
    private head?: NeedHead,
    private keyword = createKeywordMatcher(),
  ) {}

  /** `head`: the trained classifier (apps/hub/data/need-head.json); without it, nearest-example similarity alone. */
  static async create(embedder: Embedder, needs: Need[] = NEEDS, head?: NeedHead): Promise<SemanticNeedMatcher> {
    return new SemanticNeedMatcher(embedder, await buildNeedIndex(embedder, needs), head, createKeywordMatcher(needs));
  }

  async match(text: string): Promise<MatchResult> {
    const kw = this.keyword.match(text);
    if (!text.trim()) return kw;
    const [q] = await this.embedder.embed([text], 'query');
    const ranked = rankByIndex(this.index, q!);
    return combineMatches(kw, this.head ? headSignal(ranked, this.head.predict(q!)) : { ranked, confidence: semanticConfidence(ranked) });
  }
}

/** Matches what crew said to the closest verified reply. */
export class ReplyMatcher {
  private constructor(
    private embedder: Embedder,
    private index: SemanticIndex<ReplyId>,
  ) {}

  static async create(embedder: Embedder): Promise<ReplyMatcher> {
    return new ReplyMatcher(embedder, await buildReplyIndex(embedder));
  }

  async match(text: string): Promise<{ replyId: ReplyId | null; confidence: number; ranked: { id: ReplyId; score: number }[] }> {
    if (!text.trim()) return { replyId: null, confidence: 0, ranked: [] };
    const [q] = await this.embedder.embed([text], 'query');
    const ranked = rankByIndex(this.index, q!);
    const confidence = semanticConfidence(ranked);
    return { replyId: ranked[0]?.id ?? null, confidence, ranked: ranked.slice(0, 3) };
  }
}
