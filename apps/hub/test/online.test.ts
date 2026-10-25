import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOnlineLangCode, LANGUAGES, ONLINE_LANGUAGES } from '@hearme/shared';
import { OnlineService } from '../src/online/service';
import { SARVAM_CODES } from '../src/online/translation';
import { providerJson, WorkPool } from '../src/online/http';
import { wav } from '../src/online/speech';
import { AiEngine } from '../src/ai';
import { CabinRelay } from '../src/relay';
import { createHandler } from '../src/server';

const config = { sarvamKey: 'test-sarvam', groqKey: 'test-groq', groqModel: 'openai/gpt-oss-20b', speechModel: 'saaras:v4', timeoutMs: 1000 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const completion = (body: unknown) => json({ choices: [{ message: { content: JSON.stringify(body) } }] });
afterEach(() => vi.useRealTimers());

describe('online translation', () => {
  it('limits Tara to ten Indian languages and English while preserving original screen choices', () => {
    expect(LANGUAGES).toHaveLength(15);
    expect(ONLINE_LANGUAGES).toHaveLength(11);
    expect(ONLINE_LANGUAGES.map((l) => l.code).sort()).toEqual(['bn', 'en', 'gu', 'hi', 'kn', 'ml', 'mr', 'or', 'pa', 'ta', 'te']);
    for (const language of ONLINE_LANGUAGES) expect(SARVAM_CODES[language.code]).toBeTruthy();
    expect(isOnlineLangCode('as')).toBe(false); expect(isOnlineLangCode('ja')).toBe(false);
    expect(SARVAM_CODES.or).toBe('od-IN');
  });
  it('shares concurrent translations, caches successes, and sends the exact Sarvam model/locale', async () => {
    const fetcher = vi.fn(async () => json({ translated_text: 'नमस्ते' }));
    const service = new OnlineService(config, fetcher as typeof fetch);
    const results = await Promise.all([service.translator.translate('Hello', 'en', 'or'), service.translator.translate('Hello', 'en', 'or')]);
    expect(results).toEqual(['नमस्ते', 'नमस्ते']);
    await service.translator.translate('Hello', 'en', 'or');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]![1];
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'sarvam-translate:v1', target_language_code: 'od-IN', source_language_code: 'en-IN' });
    expect(service.translator.metrics).toMatchObject({ hits: 1, shared: 1, providerCalls: 1 });
  });
  it('expires cached text and never caches failed requests', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 429)).mockImplementation(async () => json({ translated_text: 'water' }));
    const service = new OnlineService(config, fetcher as typeof fetch);
    await expect(service.translator.translate('पानी', 'hi', 'en')).rejects.toThrow('429');
    expect(await service.translator.translate('पानी', 'hi', 'en')).toBe('water');
    await service.translator.translate('पानी', 'hi', 'en');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_001);
    await service.translator.translate('पानी', 'hi', 'en');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('returns same-language text without any network operation and rejects unknown locales', async () => {
    const fetcher = vi.fn();
    const service = new OnlineService(config, fetcher);
    expect(await service.translator.translate('hello', 'en', 'en')).toBe('hello');
    await expect(service.translator.translate('hello', 'xx', 'en')).rejects.toThrow('Unknown');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains Japanese translation through Groq with schema validation', async () => {
    const fetcher = vi.fn(async () => completion({ text: 'お水' }));
    const service = new OnlineService(config, fetcher as typeof fetch);
    expect(await service.translator.translate('water', 'en', 'ja')).toBe('お水');
    expect((fetcher.mock.calls as unknown as [string][])[0]![0]).toContain('api.groq.com');
  });
});

describe('conversations', () => {
  it('sanitizes refused IDs, invalid purposes and confidence before existing clients see them', async () => {
    const service = new OnlineService(config, vi.fn(async () => completion({ requests: [{ needId: 'water', purposeId: 'vegetarian', confidence: 4 }, { needId: 'tea', purposeId: null, confidence: 1 }, { needId: 'invented', confidence: 1 }], refused: ['tea'] })) as typeof fetch);
    const result = await service.analyze('Water, not tea');
    expect(result).toEqual({ requests: [{ needId: 'water', confidence: 1 }], refused: ['tea'] });
  });
  it('fails clearly without keys and never falls back to local inference', async () => {
    const fetcher = vi.fn();
    const service = new OnlineService({ ...config, groqKey: '', sarvamKey: '' }, fetcher);
    await expect(service.analyze('Hello', 'en')).rejects.toThrow('GROQ_API_KEY');
    await expect(service.translator.translate('Hello', 'en', 'hi')).rejects.toThrow('SARVAM_API_KEY');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('bounded online work and speech', () => {
  it('limits concurrent translations to four provider requests', async () => {
    const releases: (() => void)[] = [];
    let active = 0; let maximum = 0;
    const fetcher = vi.fn(async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--; return json({ translated_text: 'translated' });
    });
    const service = new OnlineService(config, fetcher as typeof fetch);
    const work = Array.from({ length: 6 }, (_, i) => service.translator.translate(`request ${i}`, 'en', 'hi'));
    await vi.waitFor(() => expect(releases).toHaveLength(4));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());
    await Promise.all(work); expect(maximum).toBe(4);
  });
  it('rejects excess queued work and recovers capacity after a failure', async () => {
    const pool = new WorkPool(1, 1); let release!: () => void;
    const first = pool.run(() => new Promise<void>((resolve) => { release = resolve; }));
    const second = pool.run(async () => 2);
    await expect(pool.run(async () => 3)).rejects.toThrow('busy');
    release(); await first; expect(await second).toBe(2);
    await expect(pool.run(async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(await pool.run(async () => 4)).toBe(4);
  });
  it('supplies an abort signal and sanitizes raw provider failures', async () => {
    let received: AbortSignal | null | undefined;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => { received = init?.signal; return json({ secret: 'do not expose' }, 401); });
    await expect(providerJson(fetcher as typeof fetch, 'https://example.test', {}, 1000)).rejects.toThrow('401');
    expect(received).toBeInstanceOf(AbortSignal);
    expect(received!.aborted).toBe(false);
  });
  it('encodes clipped 16kHz mono audio in memory', () => {
    const bytes = wav(new Float32Array([-2, 0, 2]));
    expect(Buffer.from(bytes).toString('ascii', 0, 4)).toBe('RIFF');
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getInt16(44, true)).toBe(-32767);
    expect(view.getInt16(48, true)).toBe(32767);
  });
  it('selects Sarvam for Indian audio and Groq for Japanese', async () => {
    const fetcher = vi.fn(async (url: unknown) => json(String(url).includes('sarvam') ? { transcript: 'नमस्ते' } : { text: 'こんにちは' }));
    const service = new OnlineService(config, fetcher as typeof fetch);
    expect(await service.speech.transcribe(new Float32Array(8000), 'hi')).toBe('नमस्ते');
    expect(await service.speech.transcribe(new Float32Array(8000), 'ja')).toBe('こんにちは');
    const init = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]![1];
    expect((init.body as FormData).get('language_code')).toBe('hi-IN');
  });
});
