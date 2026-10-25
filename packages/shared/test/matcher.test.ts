import { describe, expect, it } from 'vitest';
import { CONFIDENCE_THRESHOLD, decide, defaultMatcher, headSignal, NeedHead, normalize, SAMPLE_UTTERANCES, type LangCode } from '../src';

const m = (text: string) => defaultMatcher.match(text);

describe('keyword intent matcher (stand-in for multilingual-e5)', () => {
  it('matches the PDF story: Hindi "hot water for medicine" confidently, with the purpose', () => {
    const r = m('मुझे दवाई के लिए गरम पानी चाहिए');
    expect(r.candidates[0]?.needId).toBe('hot_water');
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(r.purposeId).toBe('for_medicine');
  });

  it('asks with pictures when noise cut the words (mockup step 2: hot water, tea, blanket)', () => {
    const d = decide(m('… गरम … चाहिए …'));
    expect(d.kind).toBe('ask');
    expect(d.kind === 'ask' && d.options).toEqual(['hot_water', 'tea', 'blanket']);
  });

  it('prefers the longer phrase: "गरम पानी" is hot water, not water', () => {
    expect(m('गरम पानी').candidates.map((c) => c.needId)).toEqual(['hot_water']);
  });

  it('treats "medicine" on its own as the medicine need', () => {
    const r = m('I need my medicine');
    expect(r.candidates[0]?.needId).toBe('medicine');
    expect(r.purposeId).toBeUndefined();
  });

  it('matches whole words only for Latin script', () => {
    expect(m('instead').candidates).toEqual([]);
  });

  it('handles Vietnamese diacritics and romanised Hindi', () => {
    expect(m('Cho tôi nước nóng').candidates[0]?.needId).toBe('hot_water');
    expect(m('garam pani please').candidates[0]?.needId).toBe('hot_water');
  });

  it('falls back to common options when nothing matches', () => {
    const d = decide(m('xyz'));
    expect(d).toMatchObject({ kind: 'ask', options: ['water', 'toilet', 'blanket'], confidence: 0 });
  });

  it.each(Object.keys(SAMPLE_UTTERANCES) as LangCode[])('sample utterances for %s: clear → confident hot water, noisy → ask', (lang) => {
    const sample = SAMPLE_UTTERANCES[lang]!;
    const clear = decide(m(sample.clear));
    expect(clear).toMatchObject({ kind: 'confident', needId: 'hot_water', purposeId: 'for_medicine' });
    expect(decide(m(sample.noisy)).kind).toBe('ask');
  });

  it('normalises punctuation and case', () => {
    expect(normalize('Hot, WATER!')).toBe(' hot water ');
  });
});

describe('sound-alike tier (Whisper spellings, from the speech eval)', () => {
  it('finds needs Whisper spelled the way they sound, but asks with pictures', () => {
    for (const [text, need] of [
      ['मुझे मेरी डवा चाही', 'medicine'], // डवा = दवा
      ['बहुत ठन्द है, कमबल दे देदेजे', 'blanket'], // कमबल = कंबल
      ['นาวจัง ขอภาพฮมหน่อย', 'blanket'], // ภาพฮม ≈ ผ้าห่ม
      ['Tôi cần xe lăng khi hạ cánh.', 'wheelchair_arrival'], // lăng ≈ lăn
    ] as const) {
      const r = m(text);
      expect(r.candidates[0]?.needId, text).toBe(need);
      expect(r.confidence, text).toBeLessThan(CONFIDENCE_THRESHOLD);
    }
  });

  it('does not read Vietnamese "ở đâu" (where) as "đau" (pain)', () => {
    const r = m('Nhà Vệ Xinh ở đâu?');
    expect(r.candidates[0]?.needId).toBe('toilet');
    expect(r.candidates.some((c) => c.needId === 'unwell')).toBe(false);
  });

  it('leaves exact matches alone', () => {
    expect(m('मुझे दवाई के लिए गरम पानी चाहिए').confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
});

describe('trained need head', () => {
  const head = new NeedHead({ model: 'toy', labels: ['water', 'tea'], weights: [[4, 0], [0, 4]], bias: [0, 0], trainedOn: 2, at: '' });

  it('turns a vector into probabilities, most likely first', () => {
    const p = head.predict(new Float32Array([1, 0]));
    expect(p[0]!.id).toBe('water');
    expect(p[0]!.p + p[1]!.p).toBeCloseTo(1);
  });

  it('is only as sure as e5 when the two disagree', () => {
    const ranked = [{ id: 'tea', score: 0.95 }, { id: 'water', score: 0.8 }];
    const s = headSignal(ranked, head.predict(new Float32Array([1, 0])));
    expect(s.ranked[0]!.id).toBe('water');
    expect(s.confidence).toBeLessThan(head.predict(new Float32Array([1, 0]))[0]!.p);
  });
});

describe('Thai has no spaces', () => {
  it('does not read "อยาก" (want) as "ยา" (medicine)', () => {
    const r = m('อยากได้ผ้าห่ม');
    expect(r.candidates[0]?.needId).toBe('blanket');
    expect(r.candidates.some((c) => c.needId === 'medicine')).toBe(false);
  });
});
