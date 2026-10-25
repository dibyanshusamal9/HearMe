/**
 * Draws docs/results.svg from the held-out speech evaluation
 * (.eval/results-small-heldout.json, made by
 * `npm run eval -- --speech --set heldout --snr 10,0`): top-1 per language
 * at each noise level.
 *
 *   npm run chart -w @hearme/hub
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HUB = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(HUB, '..', '..', 'docs', 'results.svg');
type Rows = { model: string; rows: { lang: string; expected: string; got?: string | null; snr: number | null; confidence: number }[] };
// Prefer the transcripts re-scored with the current matcher (npm run rescore); else the original run.
const rescored = join(HUB, '.eval', 'rescored-small-heldout.json');
const speech: Rows = existsSync(rescored)
  ? (JSON.parse(readFileSync(rescored, 'utf8')) as Rows)
  : (JSON.parse(readFileSync(join(HUB, '.eval', 'results-small-heldout.json'), 'utf8')) as { speech: Rows }).speech;

const LANGS: [string, string][] = [
  ['en', 'English'],
  ['hi', 'Hindi'],
  ['ja', 'Japanese'],
  ['th', 'Thai'],
  ['id', 'Indonesian'],
  ['vi', 'Vietnamese'],
];
const CONDITIONS: [number | null, string, string][] = [
  [null, 'clean', '#ff8a65'],
  [10, '10 dB SNR', '#ffb59c'],
  [0, '0 dB SNR (noise as loud as voice)', '#9fb0d0'],
];
const rate = (lang: string | null, snr: number | null) => {
  const rows = speech.rows.filter((r) => (lang === null || r.lang === lang) && (r.snr ?? null) === snr);
  return rows.length ? rows.filter((r) => r.got === r.expected).length / rows.length : 0;
};

const W = 1000;
const H = 470;
const left = 70;
const top = 96;
const plotH = 270;
const groupW = (W - left - 30) / LANGS.length;
const barW = 30;
let bars = '';
LANGS.forEach(([code, name], g) => {
  const x0 = left + g * groupW + (groupW - barW * CONDITIONS.length - 8) / 2;
  CONDITIONS.forEach(([snr, , color], c) => {
    const v = rate(code, snr);
    const h = v * plotH;
    const x = x0 + c * (barW + 4);
    bars += `<rect x="${x}" y="${top + plotH - h}" width="${barW}" height="${h}" rx="4" fill="${color}"/>`;
    bars += `<text x="${x + barW / 2}" y="${top + plotH - h - 6}" font-size="11" text-anchor="middle" fill="#c9d4ea">${Math.round(v * 100)}</text>`;
  });
  bars += `<text x="${left + g * groupW + groupW / 2}" y="${top + plotH + 24}" font-size="15" text-anchor="middle" fill="#fff">${name}</text>`;
});
let grid = '';
for (const p of [0, 25, 50, 75, 100]) {
  const y = top + plotH - (p / 100) * plotH;
  grid += `<line x1="${left}" x2="${W - 20}" y1="${y}" y2="${y}" stroke="#24324d"/><text x="${left - 10}" y="${y + 4}" font-size="12" text-anchor="end" fill="#9fb0d0">${p}%</text>`;
}
const legend = CONDITIONS.map(
  ([snr, label, color], i) =>
    `<rect x="${left + i * 250}" y="${H - 52}" width="14" height="14" rx="3" fill="${color}"/><text x="${left + 22 + i * 250}" y="${H - 40}" font-size="14" fill="#c9d4ea">${label} · ${Math.round(rate(null, snr) * 100)}% overall</text>`,
).join('');

writeFileSync(
  OUT,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">
  <title>Spoken requests understood, by language and cabin-noise level</title>
  <rect width="${W}" height="${H}" rx="20" fill="#0b1630"/>
  <text x="${left}" y="44" font-size="22" font-weight="800" fill="#fff">Spoken requests understood (top-1)</text>
  <text x="${left}" y="68" font-size="14" fill="#9fb0d0">Held-out phrasings · synthetic voices · Whisper-${speech.model} + keywords + e5 + trained head · offline on a laptop</text>
  ${grid}${bars}${legend}
</svg>
`,
);
console.log(`Saved ${OUT}`);
