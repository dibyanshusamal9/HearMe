import { describe, expect, it } from 'vitest';
import {
  labPrompts,
  labTakeQuery,
  parseLabTakeQuery,
  scoreTake,
  summarizeBy,
  summarizeTakes,
  takesToCsv,
  type LabTake,
  type LabTakeInfo,
} from '../src/lab/voiceLab';

const match = (confidence: number, ...ids: string[]) => ({ candidates: ids.map((needId, i) => ({ needId, score: 1 - i * 0.1 })), confidence });

describe('voice lab prompts', () => {
  it('reads the held-out sentences (plus the story sentence in Hindi), or asks in own words', () => {
    const read = labPrompts('passenger', 'read', 'hi');
    expect(read).toHaveLength(13);
    expect(read.at(-1)).toEqual({ expected: 'hot_water', text: 'मुझे दवाई के लिए गरम पानी चाहिए', story: true });
    expect(labPrompts('passenger', 'read', 'ja')).toHaveLength(12);
    expect(labPrompts('passenger', 'own-words', 'th').every((p) => p.text === '')).toBe(true);
    expect(labPrompts('crew', 'read', 'ja')).toHaveLength(14);
    expect(labPrompts('crew', 'own-words', 'ja')).toHaveLength(11);
  });

  it('gives pack languages sentences to read, like the core ones', () => {
    const bn = labPrompts('passenger', 'read', 'bn');
    expect(bn).toHaveLength(12);
    expect(bn.every((p) => p.text !== '')).toBe(true);
    expect(bn.find((p) => p.expected === 'water')?.text).toContain('জল');
    // Own words still means no sentence shown, in any language.
    expect(labPrompts('passenger', 'own-words', 'pa').every((p) => p.text === '')).toBe(true);
  });

  it('asks in own words for a language with no held-out set (an add-language draft)', () => {
    const draft = labPrompts('passenger', 'read', 'tl');
    expect(draft).toHaveLength(12);
    expect(draft.every((p) => p.text === '')).toBe(true);
  });
});

describe('scoring a take the way the apps act on it', () => {
  it('passenger: right / wrong picture shown, right picture offered or not, nothing heard', () => {
    const said = (m: ReturnType<typeof match>) => ({ transcript: 'x', match: m });
    expect(scoreTake('passenger', 'hot_water', said(match(0.92, 'hot_water', 'water'))).outcome).toBe('right');
    expect(scoreTake('passenger', 'tea', said(match(0.92, 'hot_water', 'tea')))).toMatchObject({ outcome: 'wrong', got: 'hot_water' });
    expect(scoreTake('passenger', 'tea', said(match(0.6, 'hot_water', 'tea')))).toMatchObject({ outcome: 'offered', options: ['hot_water', 'tea', 'water'] });
    expect(scoreTake('passenger', 'charger', said(match(0.6, 'hot_water', 'tea'))).outcome).toBe('missed');
    expect(scoreTake('passenger', 'water', { transcript: '  ', match: match(0) }).outcome).toBe('silent');
  });

  it('crew: a verified reply is suggested only from 0.5 up', () => {
    const said = (replyId: 'bringing_now' | 'one_moment', confidence: number) => ({ transcript: 'x', reply: { replyId, confidence } });
    expect(scoreTake('crew', 'bringing_now', said('bringing_now', 0.7)).outcome).toBe('right');
    expect(scoreTake('crew', 'bringing_now', said('one_moment', 0.7)).outcome).toBe('wrong');
    expect(scoreTake('crew', 'bringing_now', said('bringing_now', 0.4)).outcome).toBe('missed');
  });
});

describe('what the lab page sends', () => {
  const info: LabTakeInfo = {
    session: 'ab12-cd34',
    tester: 'DM',
    speaker: 'passenger',
    lang: 'hi',
    firstLanguage: true,
    place: 'cabin-noise',
    mic: 'phone',
    mode: 'read',
    expected: 'hot_water',
    prompt: 'मुझे गर्म पानी की ज़रूरत है',
    keepAudio: false,
  };

  it('round-trips through the query string', () => {
    expect(parseLabTakeQuery(new URLSearchParams(labTakeQuery(info)))).toEqual(info);
  });

  it('refuses unknown needs, bad sessions, and crew speaking another language', () => {
    const q = (patch: Partial<LabTakeInfo>) => new URLSearchParams(labTakeQuery({ ...info, ...patch }));
    expect(parseLabTakeQuery(q({ expected: 'champagne' }))).toMatch(/unknown need/);
    expect(parseLabTakeQuery(q({ session: '../../x' }))).toMatch(/session/);
    expect(parseLabTakeQuery(q({ speaker: 'crew', expected: 'bringing_now' }))).toMatch(/Japanese/);
    expect(parseLabTakeQuery(q({ speaker: 'crew', lang: 'ja', expected: 'bringing_now' }))).toMatchObject({ speaker: 'crew' });
  });

  it('accepts a pack language for reading and for own words', () => {
    const q = (patch: Partial<LabTakeInfo>) => new URLSearchParams(labTakeQuery({ ...info, ...patch }));
    expect(parseLabTakeQuery(q({ lang: 'bn', mode: 'own-words', prompt: '' }))).toMatchObject({ lang: 'bn' });
    expect(parseLabTakeQuery(q({ lang: 'bn', mode: 'read' }))).toMatchObject({ lang: 'bn', mode: 'read' });
    expect(parseLabTakeQuery(q({ lang: 'pa', mode: 'read' }))).toMatchObject({ lang: 'pa' });
  });

  it('a hub-only draft language can still be recorded, in own words', () => {
    const q = (patch: Partial<LabTakeInfo>) => new URLSearchParams(labTakeQuery({ ...info, ...patch }));
    expect(parseLabTakeQuery(q({ lang: 'tl', mode: 'own-words', prompt: '' }), ['tl'])).toMatchObject({ lang: 'tl' });
    expect(parseLabTakeQuery(q({ lang: 'tl', mode: 'read' }), ['tl'])).toMatch(/own words/);
    expect(parseLabTakeQuery(q({ lang: 'tl', mode: 'own-words' }))).toMatch(/required/);
  });
});

const take = (patch: Partial<LabTake>): LabTake => ({
  id: 't',
  at: '2026-10-21T10:00:00.000Z',
  session: 's1',
  tester: 'DM',
  speaker: 'passenger',
  lang: 'hi',
  firstLanguage: true,
  place: 'quiet',
  mic: 'laptop',
  mode: 'read',
  expected: 'water',
  prompt: '',
  seconds: 2,
  transcript: 'पानी',
  outcome: 'right',
  got: 'water',
  confidence: 0.9,
  options: [],
  asrMs: 1000,
  matchMs: 10,
  hubMs: 1100,
  model: 'whisper-small',
  ...patch,
});

describe('summaries and export', () => {
  it('counts outcomes; times leave out takes where nothing was heard', () => {
    const s = summarizeTakes([take({ hubMs: 1000 }), take({ hubMs: 3000, outcome: 'wrong' }), take({ hubMs: 2000, outcome: 'offered' }), take({ hubMs: 50, outcome: 'silent' })]);
    expect(s.takes).toBe(4);
    expect(s.counts).toEqual({ right: 1, offered: 1, missed: 0, wrong: 1, silent: 1 });
    expect(s.medianMs).toBe(2000);
    expect(s.p90Ms).toBe(3000);
    expect(summarizeBy([take({ lang: 'ja' }), take({}), take({})], (t) => t.lang).map((r) => [r.label, r.takes])).toEqual([
      ['hi', 2],
      ['ja', 1],
    ]);
  });

  it('writes CSV that spreadsheets open safely', () => {
    const csv = takesToCsv([take({ transcript: '=HYPERLINK("x")', prompt: 'a, "b"', options: ['tea', 'water'] })]);
    const [head, row] = csv.trim().split('\r\n');
    expect(head!.split(',')[0]).toBe('at');
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain('"a, ""b"""');
    expect(row).toContain(',tea water,');
  });
});
