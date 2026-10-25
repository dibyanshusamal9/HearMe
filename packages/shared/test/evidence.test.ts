import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_THRESHOLD,
  LANGUAGES,
  STRINGS,
  combineMatches,
  decide,
  defaultMatcher,
  evidenceStringKey,
  t,
  type MatchEvidence,
  type MatchResult,
} from '../src';

/**
 * The Confidence Loop's distinctive claim is that HearMe says *why* it is
 * unsure, from the matching that actually happened. These tests pin that
 * mapping down: a made-up or mislabelled reason would be worse than no reason
 * at all, because the passenger would be told something untrue about what the
 * system heard.
 */

const m = (text: string) => defaultMatcher.match(text);

describe('the matcher reports what it actually matched on', () => {
  it('a catalogue phrase said outright is "exact_words", and names the word', () => {
    const r = m('can I have a blanket please');
    expect(r.evidence).toBe('exact_words');
    expect(r.matchedWord).toBe('blanket');
    expect(r.candidates[0]?.needId).toBe('blanket');
  });

  it('a mis-transcription is "sounds_like", and names the word it was taken for', () => {
    // Whisper writes कंबल (blanket) as कमबल; the sound-alike tier recovers it.
    const r = m('मुझे कमबल चाहिए');
    expect(r.evidence).toBe('sounds_like');
    expect(r.matchedWord).toBe('कंबल');
    // ... and matching by sound alone never reaches the send-without-asking threshold.
    expect(r.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('a supporting word only is "weak_hint"', () => {
    const r = m('I am thirsty');
    expect(r.evidence).toBe('weak_hint');
    expect(r.matchedWord).toBe('thirsty');
  });

  it('nothing recognised is "nothing"', () => {
    expect(m('qwertyuiop').evidence).toBe('nothing');
    expect(m('').evidence).toBe('nothing');
  });

  it('keywords and the meaning model agreeing is "both_agree"', () => {
    const kw = m('a blanket please');
    const sem = { ranked: [{ id: 'blanket', score: 0.9 }], confidence: 0.7 };
    expect(combineMatches(kw, sem).evidence).toBe('both_agree');
  });

  it('keywords and the meaning model disagreeing is "disagree", and stops a confident send', () => {
    // "heat some water" contains the word "water" but means hot water.
    const kw = m('could you heat some water');
    const sem = { ranked: [{ id: 'hot_water', score: 0.9 }], confidence: 0.8 };
    const combined = combineMatches(kw, sem);
    expect(combined.evidence).toBe('disagree');
    expect(decide(combined).kind).toBe('ask');
  });

  it('the meaning model alone, with no known word, is "meaning"', () => {
    const kw = m('qwertyuiop');
    const sem = { ranked: [{ id: 'blanket', score: 0.88 }], confidence: 0.5 };
    expect(combineMatches(kw, sem).evidence).toBe('meaning');
  });
});

describe('every reason can be shown to a passenger', () => {
  const all: MatchEvidence[] = ['exact_words', 'sounds_like', 'meaning', 'both_agree', 'disagree', 'weak_hint', 'nothing'];

  it('maps every reason to an interface string that exists', () => {
    for (const e of all) {
      const key = evidenceStringKey(e);
      expect(STRINGS[key], `${e} -> ${key}`).toBeDefined();
    }
    // An unset reason still produces something sayable rather than a blank.
    expect(STRINGS[evidenceStringKey(undefined)]).toBeDefined();
  });

  it('reads in every language HearMe offers, with the heard word filled in', () => {
    for (const l of LANGUAGES) {
      for (const e of all) {
        const text = t(l.code, evidenceStringKey(e), { word: 'पानी' });
        expect(text, `${l.code} ${e}`).toBeTruthy();
        expect(text, `${l.code} ${e} left a placeholder`).not.toContain('{word}');
      }
    }
  });
});

describe('decide carries the reason to the screen', () => {
  it('keeps the evidence on both outcomes', () => {
    const confident = decide(m('a blanket please'));
    expect(confident.kind).toBe('confident');
    expect(confident.evidence).toBe('exact_words');

    const asked = decide({ candidates: [], confidence: 0, evidence: 'nothing' } satisfies MatchResult);
    expect(asked.kind).toBe('ask');
    expect(asked.evidence).toBe('nothing');
    // Nothing understood still offers the three most common requests, not a dead end.
    expect(asked.kind === 'ask' && asked.options).toEqual(['water', 'toilet', 'blanket']);
  });
});
