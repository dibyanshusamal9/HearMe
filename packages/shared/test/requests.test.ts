import { describe, expect, it } from 'vitest';
import { LOCALE_PACKS, defaultMatcher, mayHoldSeveral, splitRequests, understandRequests } from '../src';
import { HELDOUT_PHRASES } from '../src/lab/phrases';
import { REQUEST_CASES } from '../src/lab/requestCases';

const understand = (text: string) => understandRequests(text, (t) => defaultMatcher.match(t), defaultMatcher);
const sorted = (a: string[]) => [...a].sort();

describe('several requests in one sentence, and refusals, in every language', () => {
  it.each(REQUEST_CASES.map((c) => [`${c.lang}: ${c.text}`, c] as const))('%s', async (_, c) => {
    const r = await understand(c.text);
    expect(sorted(r.requests.map((x) => x.needId))).toEqual(sorted(c.want));
    expect(sorted(r.refused)).toEqual(sorted(c.refused ?? []));
    if (c.purpose) expect(r.requests.find((x) => x.needId === c.purpose![0])?.purposeId).toBe(c.purpose[1]);
  });

  it('drops quotes and punctuation-only parts', () => {
    expect(splitRequests('“चाय चाहिए”')).toEqual([{ text: 'चाय चाहिए', refused: false, negated: false }]);
    expect(splitRequests('"Tea, please."').map((p) => p.text)).toEqual(['Tea', 'please']);
  });

  it('keeps a simple request as one part', () => {
    expect(splitRequests('मुझे दवाई के लिए गरम पानी चाहिए')).toHaveLength(1);
    expect(mayHoldSeveral('मुझे दवाई के लिए गरम पानी चाहिए')).toBe(false);
    expect(mayHoldSeveral('खाना मत भेजिए')).toBe(true);
  });
});

describe('single requests stay single, and are never read as refusals', () => {
  const singles = [
    ...Object.entries(HELDOUT_PHRASES).flatMap(([lang, byNeed]) => Object.entries(byNeed ?? {}).map(([needId, text]) => ({ lang, needId, text }))),
    ...LOCALE_PACKS.flatMap((p) => Object.entries(p.examples ?? {}).flatMap(([needId, list]) => list.map((text) => ({ lang: p.code, needId, text })))),
  ];

  it.each(singles.map((s) => [`${s.lang} ${s.needId}: ${s.text}`, s] as const))('%s', async (_, s) => {
    const r = await understand(s.text);
    expect(r.refused).toEqual([]);
    // One request stays one: no tea read into Punjabi ਚਾਹੀਦਾ ("need"), no medicine when it is only the reason for hot water.
    expect(r.requests.length).toBeLessThanOrEqual(1);
  });
});
