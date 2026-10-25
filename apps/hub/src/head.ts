import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NEEDS, NeedHead, type NeedHeadWeights } from '@hearme/shared';
import { EMBED_MODEL } from './models';

const FILE = fileURLToPath(new URL('../data/need-head.json', import.meta.url));

/**
 * The trained need classifier (npm run train), or undefined when it is
 * missing or stale: trained for another embedding model or another set of
 * needs. Matching then falls back to nearest-example similarity.
 */
export function loadNeedHead(): NeedHead | undefined {
  if (!existsSync(FILE)) return undefined;
  const params = JSON.parse(readFileSync(FILE, 'utf8')) as NeedHeadWeights;
  const ids = NEEDS.map((n) => n.id);
  const fresh = params.model === EMBED_MODEL && params.labels.length === ids.length && params.labels.every((l) => ids.includes(l));
  if (!fresh) console.warn('  need-head.json is out of date (run npm run train -w @hearme/hub); using e5 similarity only');
  return fresh ? new NeedHead(params) : undefined;
}
