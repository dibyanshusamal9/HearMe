/**
 * Several requests in one sentence, and refusals ("not cold water"), through
 * the hub's real matcher (keywords + e5 + trained classifier per part):
 *
 *   npm run multi -w @hearme/hub
 *
 * Also checks that single-request phrasings (tuning + held-out) are not
 * mistaken for several requests.
 */
import { CONFIDENCE_THRESHOLD, SemanticNeedMatcher, createKeywordMatcher, splitRequests, understandRequests } from '@hearme/shared';
import { createE5 } from '../ai';
import { loadNeedHead } from '../head';
import { withLanguagePacks } from '../langpacks';
import { HELDOUT_PHRASES, NEED_PHRASES } from './evalData';
const needs = withLanguagePacks();
const sem = await SemanticNeedMatcher.create(await createE5(3), needs, loadNeedHead());
const kw = createKeywordMatcher(needs);
const run = (t: string) => understandRequests(t, (p) => sem.match(p), kw);
const MULTI: [string, string[], string?][] = [
  ['मुझे ठंडा पानी नहीं चाहिए, दवाई लेने के लिए गरम पानी चाहिए, और हो सके तो एक कंबल भी दे दीजिए।', ['blanket', 'hot_water'], 'water'],
  ["I don't want cold water. I need hot water for my medicine and a blanket, please", ['blanket', 'hot_water'], 'water'],
  ['冷たい水はいらない。お湯と毛布をください', ['blanket', 'hot_water'], 'water'],
  ['ไม่เอาน้ำเปล่า ขอน้ำร้อน และผ้าห่มหน่อย', ['blanket', 'hot_water'], 'water'],
  ['Saya tidak mau air dingin, minta air panas dan selimut', ['blanket', 'hot_water']],
  ['Tôi không cần nước lạnh, cho tôi nước nóng và chăn', ['blanket', 'hot_water']],
  ['Can I have a coffee and a pillow?', ['coffee', 'pillow']],
  ['मुझे चाय और तकिया चाहिए', ['pillow', 'tea']],
  ['お茶とまくらをお願いします', ['pillow', 'tea']],
  ['ขอชาร้อนและหมอนหน่อย', ['pillow', 'tea']],
];
let ok = 0;
for (const [t, want, refusedWant] of MULTI) {
  const r = await run(t);
  const got = r.requests.map((x) => x.needId).sort();
  const good = JSON.stringify(got) === JSON.stringify([...want].sort()) && (!refusedWant || r.refused.includes(refusedWant));
  if (good) ok++;
  else console.log(`MISS "${t}" -> ${JSON.stringify(r)}`);
}
console.log(`multi-request sentences: ${ok}/${MULTI.length} exactly right`);
// Single-request phrasings: how often does the multi path wrongly kick in?
let triggered = 0, wrongMulti = 0, total = 0;
for (const set of [NEED_PHRASES, HELDOUT_PHRASES] as Record<string, Record<string, string | string[]>>[]) {
  for (const needsByLang of Object.values(set)) for (const [expected, p] of Object.entries(needsByLang)) for (const t of [p].flat()) {
    total++;
    const parts = splitRequests(t);
    if (parts.length < 2 && !parts.some((x) => x.refused)) continue;
    triggered++;
    const r = await run(t);
    const multi = r.requests.length >= 2 || (r.requests.length === 1 && r.refused.length > 0);
    const ticked = r.requests.filter((x) => x.confidence >= CONFIDENCE_THRESHOLD).map((x) => x.needId);
    if (multi && (ticked.length !== 1 || ticked[0] !== expected)) { wrongMulti++; console.log(`SINGLE->MULTI "${t}" (${expected}) -> ${JSON.stringify(r)}`); }
  }
}
console.log(`single-request phrasings: ${total}, split or refusal seen in ${triggered}, shown as several requests with a wrong pre-ticked set: ${wrongMulti}`);
process.exit(0);
