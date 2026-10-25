import { describe, expect, it } from 'vitest';
import { aggregateErrorRate, editDistance, errorRate, fmtRate, tokenize } from '../src/lab/wer';

describe('tokenizing for error rate', () => {
  it('splits space-separated languages into words', () => {
    expect(tokenize('Could I have some water, please?', 'en')).toEqual(['could', 'i', 'have', 'some', 'water', 'please']);
    expect(tokenize('मुझे गरम पानी चाहिए', 'hi')).toEqual(['मुझे', 'गरम', 'पानी', 'चाहिए']);
  });

  it('splits Japanese and Thai per character, since they are written without word spaces', () => {
    expect(tokenize('お水', 'ja')).toEqual(['お', '水']);
    expect(tokenize('ขอน้ำ', 'th')).toEqual(['ข', 'อ', 'น', '้', 'ำ']);
  });

  it('ignores case and punctuation', () => {
    expect(tokenize('Water!', 'en')).toEqual(tokenize('water', 'en'));
  });
});

describe('edit distance', () => {
  it('counts substitutions, insertions and deletions', () => {
    expect(editDistance(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    expect(editDistance(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1); // substitution
    expect(editDistance(['a', 'b'], ['a', 'b', 'c'])).toBe(1); // insertion
    expect(editDistance(['a', 'b', 'c'], ['a', 'c'])).toBe(1); // deletion
    expect(editDistance([], ['a', 'b'])).toBe(2);
    expect(editDistance(['a', 'b'], [])).toBe(2);
  });
});

describe('error rate of one transcript', () => {
  it('is zero for a perfect transcript', () => {
    expect(errorRate('I need some water', 'I need some water', 'en').rate).toBe(0);
  });

  it('is one wrong word in four', () => {
    const r = errorRate('I need some water', 'I need some winter', 'en');
    expect(r).toMatchObject({ edits: 1, reference: 4, unit: 'word' });
    expect(r.rate).toBeCloseTo(0.25);
  });

  it('counts a dropped word', () => {
    expect(errorRate('I need some water', 'I need water', 'en')).toMatchObject({ edits: 1, reference: 4 });
  });

  it('is 100% when nothing was heard', () => {
    expect(errorRate('I need some water', '', 'en').rate).toBe(1);
  });

  it('can exceed 100% when the transcript invents words', () => {
    // Whisper filling silence with text is a real failure mode, and the number should show it.
    expect(errorRate('water', 'thank you for watching this video', 'en').rate).toBeGreaterThan(1);
  });

  it('scores Japanese per character', () => {
    expect(errorRate('お水をください', 'お湯をください', 'ja')).toMatchObject({ edits: 1, reference: 7, unit: 'character' });
  });

  it('is zero when neither side has anything to compare', () => {
    expect(errorRate('', '', 'en').rate).toBe(0);
  });
});

describe('error rate over many takes', () => {
  it('divides total edits by total reference tokens, not the mean of the rates', () => {
    const items = [
      // 1 mistake in 10 words, and 1 mistake in 2 words.
      { reference: 'one two three four five six seven eight nine ten', transcript: 'one two three four five six seven eight nine TEN!', lang: 'en' },
      { reference: 'hot water', transcript: 'hot winter', lang: 'en' },
    ];
    const r = aggregateErrorRate(items)!;
    expect(r.edits).toBe(1);
    expect(r.reference).toBe(12);
    // 1/12, not the average of 0/10 and 1/2 (=25%).
    expect(r.rate).toBeCloseTo(1 / 12);
  });

  it('skips takes with no reference sentence (own-words takes)', () => {
    const r = aggregateErrorRate([
      { reference: '', transcript: 'anything at all', lang: 'en' },
      { reference: 'hot water', transcript: 'hot water', lang: 'en' },
    ])!;
    expect(r.reference).toBe(2);
    expect(r.rate).toBe(0);
  });

  it('is null when no take can be scored', () => {
    expect(aggregateErrorRate([])).toBeNull();
    expect(aggregateErrorRate([{ reference: '  ', transcript: 'x', lang: 'en' }])).toBeNull();
  });

  it('formats as a percentage, and an unmeasurable rate as a dash', () => {
    expect(fmtRate(aggregateErrorRate([{ reference: 'hot water', transcript: 'hot winter', lang: 'en' }]))).toBe('50%');
    expect(fmtRate(null)).toBe('—');
  });
});
