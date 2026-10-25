/**
 * Several requests in one sentence, and refusals ("खाना मत भेजिए", "no ice"),
 * through the hub's real matcher (keywords + e5 + trained classifier per part),
 * in every language HearMe reads:
 *
 *   npm run multi -w @hearme/hub
 *
 * Also checks that single-request phrasings (tuning, held-out and the language
 * packs' examples) are never split into several requests or read as refusals.
 */
import { LOCALE_PACKS, SemanticNeedMatcher, createKeywordMatcher, understandRequests } from '@hearme/shared';
import { REQUEST_CASES } from '@hearme/shared/lab/requests';
import { createE5 } from '../ai';
import { loadNeedHead } from '../head';
import { withLanguagePacks } from '../langpacks';
import { HELDOUT_PHRASES, NEED_PHRASES } from './evalData';

const needs = withLanguagePacks();
const sem = await SemanticNeedMatcher.create(await createE5(3), needs, loadNeedHead());
const kw = createKeywordMatcher(needs);
const run = (t: string) => understandRequests(t, (p) => sem.match(p), kw);
const sorted = (a: string[]) => JSON.stringify([...a].sort());

const byLang = new Map<string, [number, number]>();
for (const c of REQUEST_CASES) {
  const r = await run(c.text);
  const got = r.requests.map((x) => x.needId);
  const ok = sorted(got) === sorted(c.want) && sorted(r.refused) === sorted(c.refused ?? []);
  const tally = byLang.get(c.lang) ?? [0, 0];
  byLang.set(c.lang, [tally[0] + (ok ? 1 : 0), tally[1] + 1]);
  if (!ok) console.log(`MISS ${c.lang} "${c.text}"\n     want ${sorted(c.want)} refused ${sorted(c.refused ?? [])}\n     got  ${sorted(got)} refused ${sorted(r.refused)}`);
}
const right = [...byLang.values()].reduce((n, [a]) => n + a, 0);
console.log(`several requests and refusals: ${right}/${REQUEST_CASES.length} exactly right`);
console.log(`  ${[...byLang].map(([l, [a, b]]) => `${l} ${a}/${b}`).join(' · ')}`);

const singles: [string, string][] = [];
for (const byNeed of [...Object.values(NEED_PHRASES), ...Object.values(HELDOUT_PHRASES)]) {
  for (const [expected, p] of Object.entries(byNeed ?? {})) for (const t of [p].flat()) singles.push([expected, t]);
}
for (const pack of LOCALE_PACKS) for (const [expected, list] of Object.entries(pack.examples ?? {})) for (const t of list) singles.push([expected, t]);
let wrong = 0;
for (const [expected, t] of singles) {
  const r = await run(t);
  if (r.refused.length || r.requests.length > 1) {
    wrong++;
    console.log(`SINGLE "${t}" (${expected}) -> ${JSON.stringify(r)}`);
  }
}
console.log(`single-request phrasings: ${singles.length}, split into several or read as a refusal: ${wrong}`);
process.exit(0);
