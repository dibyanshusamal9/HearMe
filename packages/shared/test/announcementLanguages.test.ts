import { describe, expect, it } from 'vitest';
import { ANNOUNCEMENTS, captionOf, LANGUAGES } from '../src';

describe('announcement language coverage', () => {
  it('has a fixed caption in every selectable language for every template', () => {
    for (const language of LANGUAGES) {
      for (const announcement of ANNOUNCEMENTS) {
        const caption = captionOf({ templateId: announcement.id }, language.code)!;
        expect(caption.lang, `${announcement.id}: ${language.code}`).toBe(language.code);
        expect(caption.text.trim().length).toBeGreaterThan(0);
        expect(caption.machine).toBe(false);
        if (language.code !== 'hi') expect(caption.text).not.toBe(announcement.text.hi);
      }
    }
  });

  it('keeps a non-Japanese original in its actual source language', () => {
    const caption = captionOf({ templateId: '', broadcast: {
      sender: 'crew', sourceLang: 'ta', original: 'உணவு விரைவில் வழங்கப்படும்.',
      texts: { ta: 'உணவு விரைவில் வழங்கப்படும்.', hi: 'भोजन जल्द परोसा जाएगा।' },
    } }, 'ta');
    expect(caption).toMatchObject({ lang: 'ta', machine: false, text: 'உணவு விரைவில் வழங்கப்படும்.' });
  });
});
