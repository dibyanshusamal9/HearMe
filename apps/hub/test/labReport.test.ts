import type { LabTake } from '@hearme/shared/lab';
import { describe, expect, it } from 'vitest';
import { renderLabReport } from '../src/labReport';

let n = 0;
const take = (patch: Partial<LabTake>): LabTake => ({
  id: `t${++n}`,
  at: '2026-10-21T10:00:00.000Z',
  session: 's1',
  tester: 'DM',
  speaker: 'passenger',
  lang: 'hi',
  firstLanguage: true,
  place: 'quiet',
  mic: 'phone',
  mode: 'read',
  expected: 'water',
  prompt: 'पानी मिल सकता है?',
  seconds: 2,
  transcript: 'पानी मिल सकता है?',
  outcome: 'right',
  got: 'water',
  confidence: 0.95,
  options: [],
  asrMs: 1800,
  matchMs: 12,
  hubMs: 1900,
  model: 'onnx-community/whisper-small',
  ...patch,
});

describe('voice lab report', () => {
  const takes = [
    take({}),
    take({ hubMs: 2500 }),
    take({ outcome: 'offered', options: ['water', 'tea', 'toilet'], got: 'tea', hubMs: 2100 }),
    take({ outcome: 'wrong', expected: 'tea', got: 'hot_water', transcript: 'चाय | गरम', hubMs: 3000, tester: 'AS', session: 's2', place: 'cabin-noise' }),
    take({ outcome: 'silent', transcript: '', got: null, hubMs: 400, tester: 'AS', session: 's2', place: 'cabin-noise' }),
    take({ speaker: 'crew', lang: 'ja', expected: 'bringing_now', got: 'bringing_now', transcript: 'すぐ持ってきますね', tester: 'AS', session: 's2' }),
  ];
  const md = renderLabReport(takes, new Date('2026-10-22T09:00:00Z'));

  it('says who, how many and with which model', () => {
    expect(md).toContain('from 6 takes');
    expect(md).toContain('**Who:** 2 people (DM, AS), 2 sittings, 2026-10-21.');
    expect(md).toContain('Hindi 5, Japanese (crew) 1');
    expect(md).toContain('**Speech model:** whisper-small.');
  });

  it('gives the headline in plain words, with the wrong-picture count', () => {
    expect(md).toContain('ready to send, in **40%** of 5 passenger requests; counting one extra tap on “Did you mean…?”, **60%**');
    expect(md).toContain('A **wrong** picture appeared first in **1** (20%)');
    // Takes where nothing was heard do not count towards the time.
    expect(md).toContain('median time on the hub was **2.1 s** (90% within 3.0 s, 95% within 3.0 s)');
    // The two numbers added for the evidence pass: how often voice left the
    // passenger without a request, and how wrong the text itself was.
    expect(md).toContain('fall back to tapping or typing');
    expect(md).toMatch(/Speech-to-text (word|character) error rate was \*\*\d+%\*\*/);
    expect(md).toContain('the right verified reply was suggested in **100%** of 1');
  });

  it('names language packs by their own name', () => {
    const bn = renderLabReport([take({ lang: 'bn', mode: 'own-words', prompt: '' })], new Date('2026-10-22T09:00:00Z'), { bn: 'Bengali' });
    expect(bn).toContain('Takes by language: Bengali 1.');
  });

  it('splits by place only when there is more than one, and lists what went wrong safely', () => {
    expect(md).toContain('## Passengers, by place');
    expect(md).not.toContain('by microphone');
    expect(md).toContain('| Hindi | Tea | चाय \\| गरम | Hot water | Wrong one shown |');
    expect(md).toContain('| Hindi | Water | … | — | Nothing heard |');
  });
});
