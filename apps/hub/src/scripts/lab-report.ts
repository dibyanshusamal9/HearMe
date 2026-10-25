/**
 * Turns the voice lab's takes into docs/voice-lab.md: real voices, real
 * microphones, scored the way the apps act on them.
 *
 *   npm run lab-report                 all takes in apps/hub/.lab/takes.jsonl
 *   npm run lab-report -- --out x.md   somewhere else
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LabLog } from '../lab';
import { renderLabReport } from '../labReport';
import { loadLanguagePacks } from '../langpacks';

const args = process.argv.slice(2);
const i = args.indexOf('--out');
const out = i >= 0 && args[i + 1] ? args[i + 1]! : join(fileURLToPath(new URL('../../../../', import.meta.url)), 'docs', 'voice-lab.md');
const lab = new LabLog();
const takes = lab.list();
if (!takes.length) {
  console.error(`No voice lab takes yet in ${lab.file}.\nStart the hub (npm run hub), open http://localhost:8080/#/lab and record some, then run this again.`);
  process.exit(1);
}
writeFileSync(out, renderLabReport(takes, new Date(), Object.fromEntries(loadLanguagePacks().map((p) => [p.code, p.name]))));
console.log(`Wrote ${out} from ${takes.length} takes.`);
