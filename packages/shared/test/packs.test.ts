import { describe, expect, it } from 'vitest';
import {
  CORE_LANGS,
  CORE_NEEDS,
  LANGUAGES,
  LOCALE_PACKS,
  NEEDS,
  PASSENGER_PATH_KEYS,
  PURPOSES,
  REPLIES,
  SAFETY_STEPS,
  STRINGS,
  coverageOf,
  createKeywordMatcher,
  decide,
  describeCoverage,
  fallbackLang,
  isReservedKey,
  languageInfo,
  localePack,
  needLabel,
  purposeLabel,
  replyTextOf,
  t,
  translatedKeys,
  type LangCode,
  type StringKey,
} from '../src';
import { HELDOUT_PHRASES } from '../src/lab/phrases';

/**
 * The contract a language pack has to keep. These tests are the reason a
 * language can be *offered* at all: they fail if a pack is advertised as a
 * screen language while part of the passenger path is missing, if it leaks
 * unreviewed wording into safety or Care Mode text, or if its vocabulary does
 * not actually match the requests it claims to understand.
 */

const packLangs = LOCALE_PACKS.map((p) => p.code);
/** Hand-written packs keep the strict contract; machine drafts (NLLB-200) have their own, below. */
const writtenPacks = packLangs.filter((l) => coverageOf(l).ui !== 'machine');
const draftPacks = packLangs.filter((l) => coverageOf(l).ui === 'machine');
/** Languages with a held-out test set: only these can be measured. */
const measured = packLangs.filter((l) => HELDOUT_PHRASES[l]);

describe('every language pack is complete where it says it is', () => {
  it.each(writtenPacks)('%s translates the whole passenger path', (lang) => {
    const pack = localePack(lang)!;
    const missing = PASSENGER_PATH_KEYS.filter((k) => !pack.ui[k]?.trim());
    expect(missing, `${lang} is missing ${missing.length} passenger-path strings`).toEqual([]);
  });

  it.each(writtenPacks)('%s labels all 40 needs', (lang) => {
    const missing = NEEDS.filter((n) => !localePack(lang)!.needs[n.id]?.trim()).map((n) => n.id);
    expect(missing).toEqual([]);
  });

  it.each(writtenPacks)('%s has every verified crew reply', (lang) => {
    const missing = REPLIES.filter((r) => !localePack(lang)!.replies[r.id]?.trim()).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it.each(writtenPacks)('%s labels every purpose', (lang) => {
    const missing = PURPOSES.filter((p) => !localePack(lang)!.purposes?.[p.id]?.trim()).map((p) => p.id);
    expect(missing).toEqual([]);
  });

  it.each(writtenPacks)('%s has matching vocabulary for all 40 needs', (lang) => {
    const missing = NEEDS.filter((n) => !localePack(lang)!.phrases[n.id]?.length).map((n) => n.id);
    expect(missing).toEqual([]);
  });

  it('a pack only uses need and purpose ids that exist', () => {
    const needIds = new Set(NEEDS.map((n) => n.id));
    const purposeIds = new Set(PURPOSES.map((p) => p.id));
    for (const pack of LOCALE_PACKS) {
      for (const id of [...Object.keys(pack.needs), ...Object.keys(pack.phrases), ...Object.keys(pack.examples ?? {}), ...Object.keys(pack.hints ?? {})]) {
        expect(needIds.has(id), `${pack.code}: unknown need "${id}"`).toBe(true);
      }
      for (const id of Object.keys(pack.purposes ?? {})) expect(purposeIds.has(id as (typeof PURPOSES)[number]["id"]), `${pack.code}: unknown purpose "${id}"`).toBe(true);
    }
  });

  it('every pack UI key is a real interface string', () => {
    const keys = new Set(Object.keys(STRINGS));
    for (const pack of LOCALE_PACKS) {
      for (const k of Object.keys(pack.ui)) expect(keys.has(k), `${pack.code}: "${k}" is not an interface string`).toBe(true);
    }
  });

  it('says where its wording came from', () => {
    for (const pack of LOCALE_PACKS) expect(pack.provenance.length, pack.code).toBeGreaterThan(20);
  });
});

describe('unreviewed translation cannot reach safety or clinical text', () => {
  it('no pack supplies a reserved string', () => {
    for (const pack of LOCALE_PACKS) {
      const reserved = Object.keys(pack.ui).filter(isReservedKey);
      expect(reserved, `${pack.code} must not translate ${reserved.join(', ')}`).toEqual([]);
    }
  });

  it('the safety briefing stays in the core languages and falls back visibly', () => {
    for (const lang of packLangs) {
      const step = SAFETY_STEPS[0]!;
      const fb = fallbackLang(lang);
      expect(step.title[lang]).toBeUndefined();
      // Shown in the fallback language the picker promised, never blank.
      expect(t(lang, 'safety.title')).toBe(STRINGS['safety.title'][fb]);
    }
  });

  it('declares itself as needing native review, not reviewed', () => {
    for (const l of LANGUAGES) expect(l.coverage.review).not.toBe('native');
  });
});

describe('resolution never comes out blank', () => {
  const allLangs: LangCode[] = LANGUAGES.map((l) => l.code);

  it.each(allLangs)('%s: every need, reply and purpose resolves to text', (lang) => {
    for (const n of NEEDS) expect(needLabel(n, lang), `${lang} ${n.id}`).toBeTruthy();
    for (const r of REPLIES) expect(replyTextOf(r, lang), `${lang} ${r.id}`).toBeTruthy();
    for (const p of PURPOSES) expect(purposeLabel(p, lang), `${lang} ${p.id}`).toBeTruthy();
  });

  it.each(allLangs)('%s: every interface string resolves to text', (lang) => {
    for (const key of Object.keys(STRINGS) as StringKey[]) expect(t(lang, key), `${lang} ${key}`).toBeTruthy();
  });

  it('a pack language reads its own words where it has them, and its fallback where it does not', () => {
    // 'home.question' is on the passenger path: Bengali's own words.
    expect(t('bn', 'home.question')).toBe(localePack('bn')!.ui['home.question']);
    // 'settings.reduceMotion' is not: English, which is what Bengali falls back to.
    expect(t('bn', 'settings.reduceMotion')).toBe(STRINGS['settings.reduceMotion'].en);
    // Marathi falls back to Hindi instead, as its row says.
    expect(fallbackLang('mr')).toBe('hi');
    expect(t('mr', 'settings.reduceMotion')).toBe(STRINGS['settings.reduceMotion'].hi);
  });

  it('counts translated strings honestly', () => {
    for (const lang of writtenPacks) {
      const translated = translatedKeys(lang);
      expect(translated.length).toBeGreaterThanOrEqual(PASSENGER_PATH_KEYS.length);
      expect(translated.length).toBeLessThan(Object.keys(STRINGS).length);
      // ... which is exactly what 'partial' means in the coverage table.
      expect(coverageOf(lang).ui).toBe('partial');
    }
    for (const lang of CORE_LANGS) expect(coverageOf(lang).ui).toBe('complete');
  });
});

describe('coverage is declared, not implied', () => {
  it('describes all six layers in plain English for every language', () => {
    for (const l of LANGUAGES) {
      const rows = describeCoverage(l.code);
      expect(rows).toHaveLength(6);
      for (const r of rows) expect(r.status.length).toBeGreaterThan(3);
    }
  });

  it('a pack language names the core language it falls back to', () => {
    for (const lang of packLangs) {
      const fb = fallbackLang(lang);
      expect(CORE_LANGS).toContain(fb);
      expect(languageInfo(lang).core).toBe(false);
    }
  });

  it('a language claiming measured speech accuracy is one we have a test set for', () => {
    for (const l of LANGUAGES) {
      if (l.coverage.speech === 'good' || l.coverage.speech === 'weak') {
        expect(HELDOUT_PHRASES[l.code], `${l.code} claims measured speech but has no held-out set`).toBeDefined();
      }
    }
  });
});

describe('pack vocabulary actually matches requests', () => {
  const matcher = createKeywordMatcher();

  /**
   * Keywords alone, with no embedding model: the right picture has to be in
   * front of the passenger for at least 10 of the 12 held-out sentences.
   *
   * Not 12 of 12 on purpose. When this was first run, Bengali and Punjabi each
   * missed one sentence ("শরীরটা ভালো যাচ্ছে না", "ਸਰੀਰ ਠੀਕ ਨਹੀਂ ਲੱਗ ਰਿਹਾ" —
   * both "my body isn't doing well", neither containing a catalogue keyword).
   * Adding those exact words would have tuned the vocabulary on the held-out
   * set and made every number here meaningless, so they were left failing and
   * the floor was set at the measured level instead. Phrasings with no keyword
   * are what the embedding model is for; this test guards the floor beneath it.
   */
  const KEYWORD_FLOOR = 10;

  it.each(measured)('%s: keywords alone offer the right picture for at least 10 of 12', (lang) => {
    const set = HELDOUT_PHRASES[lang]!;
    const failures: string[] = [];
    let offeredCount = 0;
    for (const [expected, sentence] of Object.entries(set)) {
      const d = decide(matcher.match(sentence));
      const offered = d.kind === 'confident' ? [d.needId] : d.options;
      if (offered.includes(expected)) offeredCount += 1;
      else failures.push(`${expected}: “${sentence}” → ${offered.join(', ') || 'nothing'}`);
    }
    expect(offeredCount, `${lang}: only ${offeredCount}/${Object.keys(set).length}\n${failures.join('\n')}`).toBeGreaterThanOrEqual(KEYWORD_FLOOR);
  });

  it('a pack lifts its language well clear of what the core catalogue alone manages', () => {
    // Measured, not asserted blind: without pack vocabulary the keyword matcher
    // gets 1/12 top-1 in Bengali, Tamil and Punjabi (6/12 in Marathi, whose
    // script it shares with Hindi). With the packs it is 10–12 of 12.
    const withoutPacks = createKeywordMatcher(CORE_NEEDS);
    for (const lang of measured) {
      const set = HELDOUT_PHRASES[lang]!;
      const count = (m: typeof matcher) =>
        Object.entries(set).filter(([expected, sentence]) => {
          const d = decide(m.match(sentence));
          return (d.kind === 'confident' ? [d.needId] : d.options).includes(expected);
        }).length;
      expect(count(matcher), lang).toBeGreaterThan(count(withoutPacks) + 3);
    }
  });

  it.each(packLangs)('%s: a pack keyword is never confidently matched to the wrong need', (lang) => {
    const wrong: string[] = [];
    for (const [needId, words] of Object.entries(localePack(lang)!.phrases)) {
      for (const w of words) {
        const d = decide(matcher.match(w));
        if (d.kind === 'confident' && d.needId !== needId) wrong.push(`"${w}" (${needId}) → ${d.needId}`);
      }
    }
    expect(wrong, `${lang}\n${wrong.join('\n')}`).toEqual([]);
  });
});

describe('machine-drafted languages say so and stay safe', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();

  it.each(draftPacks)('%s is labelled a machine draft everywhere', (lang) => {
    const c = coverageOf(lang);
    expect([c.intent, c.ui, c.replies, c.review]).toEqual(['machine', 'machine', 'machine', 'machine']);
    expect(localePack(lang)!.provenance).toMatch(/machine draft/i);
    expect(languageInfo(lang).note).toMatch(/machine/i);
  });

  it.each(draftPacks)('%s covers most of the passenger path, and the rest falls back', (lang) => {
    const pack = localePack(lang)!;
    const path = PASSENGER_PATH_KEYS.filter((k) => !isReservedKey(k));
    const have = path.filter((k) => pack.ui[k]?.trim());
    expect(have.length / path.length, `${lang}: ${have.length}/${path.length}`).toBeGreaterThanOrEqual(0.85);
    for (const k of path) expect(t(lang, k), `${lang} ${k}`).toBeTruthy();
  });

  it.each(draftPacks)('%s keeps every placeholder a string needs', (lang) => {
    for (const [k, v] of Object.entries(localePack(lang)!.ui)) {
      expect(placeholders(v!), `${lang} ${k}`).toEqual(placeholders(STRINGS[k as StringKey].en));
    }
  });

  it.each(draftPacks)('%s labels every need, purpose and reply (in English where the draft failed)', (lang) => {
    for (const n of NEEDS) expect(needLabel(n, lang)).toBeTruthy();
    for (const p of PURPOSES) expect(purposeLabel(p, lang)).toBeTruthy();
    for (const r of REPLIES) expect(replyTextOf(r, lang)).toBeTruthy();
    const words = Object.values(localePack(lang)!.phrases).filter((w) => w.length).length;
    expect(words, `${lang}: matching words for ${words}/40 needs`).toBeGreaterThanOrEqual(30);
  });

  it("offers every language Sarvam AI covers, each with screens of its own", () => {
    const sarvam = ['hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'pa', 'or', 'en'];
    for (const code of sarvam) {
      expect(LANGUAGES.some((l) => l.code === code), code).toBe(true);
      expect(['complete', 'partial', 'machine'], code).toContain(coverageOf(code as LangCode).ui);
    }
  });
});
