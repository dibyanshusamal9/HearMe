/**
 * Re-score saved Whisper transcripts with the current matcher, without running
 * speech recognition again (minutes → seconds). Use after changing keywords,
 * sound-alike folding or calibration:
 *
 *   npm run rescore                       every .eval/results-*.json with a speech section
 *
 * Prints top-1 / sent-without-asking / wrong-but-confident per noise level and
 * top-1 per language, next to the numbers saved when Whisper ran.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIDENCE_THRESHOLD, SemanticNeedMatcher } from '@hearme/shared';
import { createE5 } from '../ai';
import { loadNeedHead } from '../head';
import { inferenceThreads } from '../models';

interface Row {
  lang: string;
  expected: string;
  snr: number | null;
  transcript: string;
  got: string | null;
  confidence: number;
}

const OUT = fileURLToPath(new URL('../../.eval/', import.meta.url));
const files = existsSync(OUT) ? readdirSync(OUT).filter((f) => /^results-.+\.json$/.test(f)) : [];
if (!files.length) {
  console.log('No saved speech results in .eval/ — run `npm run eval -- --speech` first.');
  process.exit(0);
}

const matcher = await SemanticNeedMatcher.create(await createE5(inferenceThreads()), undefined, loadNeedHead());
const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`;
const cond = (snr: number | null) => (snr === null ? 'clean' : `${snr} dB SNR`);

function score(rows: { expected: string; got: string | null; confidence: number }[]) {
  const sent = rows.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD);
  return {
    top1: pct(rows.filter((r) => r.got === r.expected).length, rows.length),
    sentWithoutAsking: pct(sent.length, rows.length),
    wrongButConfident: pct(sent.filter((r) => r.got !== r.expected).length, rows.length),
  };
}

for (const file of files) {
  const saved = JSON.parse(readFileSync(join(OUT, file), 'utf8')) as { speech?: { model: string; rows: Row[] } };
  if (!saved.speech) continue;
  const rows = saved.speech.rows;
  const now: Row[] = [];
  for (const r of rows) {
    const m = await matcher.match(r.transcript);
    now.push({ ...r, got: m.candidates[0]?.needId ?? null, confidence: m.confidence });
  }
  console.log(`\n▶ ${file} (Whisper-${saved.speech.model}, ${rows.length} clips): saved → now`);
  const table: Record<string, string>[] = [];
  for (const c of [...new Set(rows.map((r) => cond(r.snr)))]) {
    const before = score(rows.filter((r) => cond(r.snr) === c));
    const after = score(now.filter((r) => cond(r.snr) === c));
    table.push({
      condition: c,
      top1: `${before.top1} → ${after.top1}`,
      sentWithoutAsking: `${before.sentWithoutAsking} → ${after.sentWithoutAsking}`,
      wrongButConfident: `${before.wrongButConfident} → ${after.wrongButConfident}`,
    });
  }
  console.table(table);
  const langs = [...new Set(rows.map((r) => r.lang))];
  console.log(
    '  top-1 by language (all conditions):',
    Object.fromEntries(langs.map((l) => [l, `${score(rows.filter((r) => r.lang === l)).top1} → ${score(now.filter((r) => r.lang === l)).top1}`])),
  );
  writeFileSync(join(OUT, file.replace('results-', 'rescored-')), JSON.stringify({ at: new Date().toISOString(), model: saved.speech.model, rows: now }, null, 2));
}
