import type { LangCode } from '../types';

/**
 * Sound-alike folding for speech transcripts.
 *
 * Whisper often spells a word the way it sounds rather than the way the
 * catalogue does: डवा for दवा, कमबल for कंबल, นาว for หนาว, "nha ve xinh" for
 * "nhà vệ sinh". Folding letters that sound alike to one representative, then
 * allowing an edit or two on longer phrases, lets the matcher still find the
 * need. Matches found this way count for less than exact ones, so a doubtful
 * transcript ends in "Did you mean?" pictures rather than a wrong request.
 */

const DEVANAGARI_SAME: Record<string, string> = {
  'ख': 'क', 'घ': 'ग', 'छ': 'च', 'झ': 'ज', 'ट': 'त', 'ठ': 'त', 'थ': 'त', 'ड': 'द', 'ढ': 'द', 'ध': 'द',
  'ण': 'न', 'फ': 'प', 'भ': 'ब', 'व': 'ब', 'श': 'स', 'ष': 'स',
  'ी': 'ि', 'ू': 'ु', 'ई': 'इ', 'ऊ': 'उ', 'ै': 'े', 'ौ': 'ो', 'ऐ': 'ए', 'औ': 'ओ',
};

const THAI_SAME: Record<string, string> = {
  'ข': 'ค', 'ฃ': 'ค', 'ฅ': 'ค', 'ฆ': 'ค', 'ฉ': 'ช', 'ฌ': 'ช', 'ศ': 'ซ', 'ษ': 'ซ', 'ส': 'ซ', 'ญ': 'ย', 'ฎ': 'ด', 'ฏ': 'ต',
  'ฐ': 'ท', 'ฑ': 'ท', 'ฒ': 'ท', 'ถ': 'ท', 'ธ': 'ท', 'ณ': 'น', 'ผ': 'พ', 'ภ': 'พ', 'ฝ': 'ฟ', 'ห': 'ฮ', 'ฬ': 'ล',
  // Vowel length is often misheard: long and short forms count as the same sound.
  'ี': 'ิ', 'ู': 'ุ', 'ื': 'ึ',
};

const mapChars = (s: string, table: Record<string, string>) => [...s].map((c) => table[c] ?? c).join('');

function foldDevanagari(s: string): string {
  return mapChars(
    s
      .replace(/़/g, '') // nukta: ड़ → ड, फ़ → फ
      .replace(/[ँं](?=[पफबभम])/g, 'म') // anusvara before a lip sound is "m" (कंबल = कमबल)
      .replace(/[ँं]/g, 'न')
      .replace(/्/g, ''), // virama: कम्बल = कमबल
    DEVANAGARI_SAME,
  );
}

function foldThai(s: string): string {
  return mapChars(
    s
      .replace(/.์/g, '') // a letter under the silencer mark is not pronounced
      .replace(/ำ/g, 'าม') // ำ sounds like า + ม (น้ำ = น้าม)
      .replace(/เ(.)ีย/g, '$1ี') // Whisper often drops the เ–ีย glide (อาเจียน → อาจีน)
      .replace(/ห(?=[งญนมยรลว])/g, '') // leading ห only sets the tone (หนาว sounds like นาว)
      .replace(/[็-๋]/g, ''), // tone marks
    THAI_SAME,
  );
}

function foldVietnamese(s: string): string {
  // Input is already lower-case without tone marks. Northern/southern merges Whisper mixes up.
  return s
    .replace(/x/g, 's')
    .replace(/tr/g, 'ch')
    .replace(/\bgi/g, 'd')
    .replace(/\br/g, 'd')
    .replace(/ng\b/g, 'n')
    .replace(/nh\b/g, 'n');
}

function foldHinglish(s: string): string {
  return s.replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/w/g, 'v');
}

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Sound-alike form of already-normalized text, for the language a keyword belongs to. */
/** Other Indian scripts (Bengali, Tamil, …) line up letter for letter with Devanagari, so they share its folding. */
function indicToDevanagari(s: string): string {
  return s.replace(/[\u0980-\u0D7F]/g, (c) => String.fromCharCode(0x0900 + ((c.charCodeAt(0) - 0x0980) % 0x80)));
}

/** `lang`: one of the 6 languages, or a language-pack code (Indian scripts fold like Hindi). */
export function soundAlike(normalized: string, lang: LangCode | string): string {
  switch (lang) {
    case 'hi':
      return foldHinglish(foldDevanagari(normalized));
    case 'th':
      return foldThai(normalized);
    case 'vi':
      return foldVietnamese(normalized);
    case 'ja':
      return toHiragana(normalized);
    default:
      return /[\u0980-\u0D7F]/.test(normalized) ? foldDevanagari(indicToDevanagari(normalized)) : normalized;
  }
}

const LATIN = /^[a-z0-9 ]+$/;

/** How many edits a keyword of this length may differ by. Short words must match exactly (as sounds). */
export function allowedEdits(keyword: string, lang: LangCode | string): number {
  const n = [...keyword].length;
  if (lang === 'ja') return 0;
  if (LATIN.test(keyword)) return n >= 9 ? 2 : n >= 5 ? 1 : n >= 4 ? 0 : -1;
  return n >= 8 ? 2 : n >= 4 ? 1 : n >= 3 ? 0 : -1;
}

export interface FuzzyHit {
  start: number;
  end: number;
  edits: number;
}

/**
 * Best approximate occurrence of `keyword` in `text` (Sellers' algorithm), or
 * null when none is within `maxEdits`. Keywords in space-separated scripts
 * must start and end on word boundaries.
 */
export function fuzzyFind(text: string, keyword: string, maxEdits: number, wholeWords: boolean): FuzzyHit | null {
  if (maxEdits < 0) return null;
  const t = [...text];
  const p = [...keyword];
  const m = p.length;
  if (!m) return null;
  // prev[i] / start[i]: edit cost and start index of the best alignment of p[0..i) ending here.
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let prevStart = new Array<number>(m + 1).fill(0);
  let best: FuzzyHit | null = null;
  for (let j = 1; j <= t.length; j++) {
    const cur = [0];
    const curStart = [j];
    for (let i = 1; i <= m; i++) {
      const sub = prev[i - 1]! + (p[i - 1] === t[j - 1] ? 0 : 1);
      const del = prev[i]! + 1;
      const ins = cur[i - 1]! + 1;
      if (sub <= del && sub <= ins) {
        cur.push(sub);
        curStart.push(i === 1 ? j - 1 : prevStart[i - 1]!);
      } else if (del <= ins) {
        cur.push(del);
        curStart.push(prevStart[i]!);
      } else {
        cur.push(ins);
        curStart.push(curStart[i - 1]!);
      }
    }
    const cost = cur[m]!;
    const start = curStart[m]!;
    if (cost <= maxEdits && (!best || cost < best.edits)) {
      const okStart = !wholeWords || start === 0 || t[start - 1] === ' ';
      const okEnd = !wholeWords || j === t.length || t[j] === ' ';
      if (okStart && okEnd) best = { start, end: j, edits: cost };
    }
    prev = cur;
    prevStart = curStart;
  }
  return best;
}
