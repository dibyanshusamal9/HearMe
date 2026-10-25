/**
 * Accessibility check: runs axe-core (WCAG 2.1 A and AA rules) on every
 * screen the demo shows, in headless Chrome against the running hub.
 *
 *   npm run a11y -w @hearme/hub      starts a hub without the AI models if none is running
 *
 * Exits non-zero when a serious or critical violation is found.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, startChrome } from './cdp';

const HUB_DIR = fileURLToPath(new URL('../../', import.meta.url));
const HUB = 'http://localhost:8080';
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAGES: [string, string, [number, number]][] = [
  ['Launcher', `${HUB}/`, [1440, 900]],
  ['Demo stage', `${HUB}/#/stage`, [1600, 900]],
  ['Crew console', `${HUB}/#/crew`, [1440, 900]],
  ['Seatback (IFE)', `${HUB}/?seat=23C#/ife`, [1280, 720]],
  ['Phone app', `${HUB}/mobile/?seat=23C`, [400, 860]],
  ['Seat cards', `${HUB}/seats`, [1200, 900]],
];

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[] }[];
}

async function hubUp(): Promise<boolean> {
  return fetch(`${HUB}/api/status`).then(
    (r) => r.ok,
    () => false,
  );
}

async function main() {
  let hub: ChildProcess | null = null;
  if (!(await hubUp())) {
    hub = spawn('npx', ['tsx', 'src/main.ts'], { cwd: HUB_DIR, env: { ...process.env, HEARME_NO_AI: '1' }, stdio: 'ignore' });
    for (let i = 0; i < 60 && !(await hubUp()); i++) await sleep(500);
  }
  const profile = join(HUB_DIR, '.eval', 'a11y-profile');
  rmSync(profile, { recursive: true, force: true });
  const chrome = startChrome(profile, [1440, 900]);
  const cdp = await Cdp.connect();
  let serious = 0;
  try {
    await cdp.send('Page.enable');
    for (const [name, url, [width, height]] of PAGES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await cdp.send('Page.navigate', { url });
      await sleep(3500);
      await cdp.eval(AXE);
      const violations = await cdp.eval<Violation[]>(
        `axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target })) })))`,
      );
      console.log(`\n▶ ${name}: ${violations.length ? `${violations.length} rule(s) violated` : 'no violations'}`);
      for (const v of violations) {
        if (v.impact === 'serious' || v.impact === 'critical') serious++;
        console.log(`  [${v.impact}] ${v.id}: ${v.help}\n      e.g. ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
      }
    }
  } finally {
    cdp.close();
    chrome.kill();
    hub?.kill();
  }
  console.log(serious ? `\n${serious} serious/critical rule(s) to fix.` : '\nNo serious or critical violations.');
  process.exit(serious ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
