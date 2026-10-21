/**
 * Real-voice results from the voice lab (#/voicelab), by language and noise:
 *
 *   npm run voicelab -w @hearme/hub
 *
 * Reads .eval/voicelab.jsonl (text only: what Whisper heard and what it matched).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIDENCE_THRESHOLD, languageName } from '@hearme/shared';

interface Row {
  lang: string;
  expected: string;
  got: string | null;
  top3: string[];
  confidence: number;
  asrMs: number;
  noise: boolean;
  speaker?: string;
}

const file = fileURLToPath(new URL('../../.eval/voicelab.jsonl', import.meta.url));
if (!existsSync(file)) {
  console.log('No voice-lab results yet. Open http://localhost:8080/#/voicelab while the hub runs.');
  process.exit(0);
}
const rows = readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Row);
const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`;
const groups = new Map<string, Row[]>();
for (const r of rows) {
  const key = `${languageName(r.lang)}${r.noise ? ' + cabin noise' : ''}`;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}
const table: Record<string, Record<string, string | number>> = {};
for (const [key, g] of [...groups.entries(), ['all', rows] as [string, Row[]]]) {
  const ms = g.map((r) => r.asrMs).sort((a, b) => a - b);
  table[key] = {
    requests: g.length,
    speakers: new Set(g.map((r) => r.speaker ?? '?')).size,
    top1: pct(g.filter((r) => r.got === r.expected).length, g.length),
    top3: pct(g.filter((r) => r.top3.includes(r.expected)).length, g.length),
    wrongButConfident: pct(g.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD && r.got !== r.expected).length, g.length),
    medianSpeechMs: ms[Math.floor(ms.length / 2)] ?? 0,
  };
}
console.log(`\n▶ Voice lab: ${rows.length} real-voice requests`);
console.table(table);
