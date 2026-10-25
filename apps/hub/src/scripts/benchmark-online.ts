import { performance } from 'node:perf_hooks';
import { loadEnvFile } from 'node:process';
import { OnlineService } from '../online/service';
try { loadEnvFile(new URL('../../../../.env', import.meta.url)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
if (!process.env.SARVAM_API_KEY) throw new Error('Set SARVAM_API_KEY in .env. This benchmark makes paid Sarvam calls with synthetic text only.');
const service = new OnlineService();
const samples: number[] = [];
for (const phrase of ['Please bring water.', 'A blanket, please.', 'May I have a vegetarian meal?', 'Where is my seat?', 'Thank you for your help.']) {
  const started = performance.now();
  await service.translator.translate(phrase, 'en', 'hi');
  samples.push(performance.now() - started);
}
const cached = performance.now();
await service.translator.translate('Please bring water.', 'en', 'hi');
const sorted = [...samples].sort((a, b) => a - b);
console.log(JSON.stringify({ synthetic: true, uncachedSamplesMs: samples.map(Math.round), medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]!), cacheHitMs: Math.round(performance.now() - cached), metrics: service.translator.metrics }, null, 2));
