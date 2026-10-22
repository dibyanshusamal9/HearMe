import { getNeed } from '../catalog/needs';
import type { NeedPurpose } from '../types';
import type { IntentMatcher, MatchResult } from './matcher';

/**
 * One sentence can hold several requests, and can refuse something:
 * "मुझे ठंडा पानी नहीं चाहिए, दवाई लेने के लिए गरम पानी चाहिए, और हो सके तो
 * एक कंबल भी दे दीजिए" is hot water (for medicine) and a blanket, and *not*
 * cold water. The sentence is split at punctuation and "and"-words, each part
 * is matched on its own, and parts that refuse ("नहीं चाहिए", "don't want",
 * "いらない", "ไม่เอา", "tidak mau", "không cần", "instead of") rule needs out.
 */

// Punctuation (a full stop only at the end of a sentence), "and"-words, and the space Thai writes between clauses.
const SEPARATORS =
  /[,;،।!?。、，！？\n]+|\.(?=\s|$)|\s(?:और|तथा|फिर|साथ ही|and|also|plus|then|dan|lalu|juga|serta|và|rồi|cùng)\s|そして|それから|あと|และ|แล้วก็|รวมถึง|(?<=[\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/giu;

const REFUSAL = new RegExp(
  [
    'नहीं\\s*(चाहि|चाहत|लेन|लूँग|लुंग|दीजि|दो)',
    'मत\\s*(दो|दीजिए|दें|देना|लाओ|लाइए|लाना)',
    "\\bdon'?t\\s+(want|need|bring|give)\\b",
    '\\bdo\\s+not\\s+(want|need)\\b',
    '\\bno\\s+more\\b',
    '\\bno\\s+(cold|hot|ice|iced|water|tea|coffee|milk|sugar|meat)\\b',
    'いら(ない|ないです|ないで)',
    'いりません',
    '要らない',
    '結構です',
    'ไม่(เอา|ต้อง|อยากได้)',
    '\\b(tidak|tak|nggak|gak|ga)\\s+(mau|perlu|usah)\\b',
    '\\bjangan\\b',
    '(^|\\s)không\\s+(cần|muốn|lấy|uống)',
    '(^|\\s)đừng(\\s|$)',
  ].join('|'),
  'iu',
);

/** "X instead of Y": which side is refused. */
const INSTEAD: [RegExp, 'before' | 'after'][] = [
  [/\binstead of\b/i, 'after'],
  [/\s(?:की जगह|के बजाय|के बदले)\s/u, 'before'],
  [/じゃなくて|ではなくて|ではなく/u, 'before'],
  [/\sthay vì\s/iu, 'after'],
  [/\s(?:bukan|daripada)\s/iu, 'after'],
];

export interface RequestPart {
  text: string;
  refused: boolean;
}

export function splitRequests(text: string): RequestPart[] {
  const parts: RequestPart[] = [];
  for (const chunk of text.split(SEPARATORS)) {
    const c = chunk?.trim();
    if (!c) continue;
    const instead = INSTEAD.find(([re]) => re.test(c));
    if (instead) {
      const [before, after] = c.split(instead[0]).map((s) => s.trim());
      if (before) parts.push({ text: before, refused: instead[1] === 'before' });
      if (after) parts.push({ text: after, refused: instead[1] === 'after' });
      continue;
    }
    parts.push({ text: c, refused: REFUSAL.test(c) });
  }
  return parts;
}

export interface UnderstoodRequest {
  needId: string;
  purposeId?: NeedPurpose['id'];
  /** How sure: high when the part names the need outright. */
  confidence: number;
}

export interface UnderstoodRequests {
  requests: UnderstoodRequest[];
  /** Needs the passenger said they do not want. */
  refused: string[];
}

/** A part matched only by meaning (no keyword) must be this sure to count as its own request. */
const MIN_PART_CONFIDENCE = 0.85;

/** Politeness on its own is not a request ("please" is not "call the crew"). */
const FILLER = new RegExp(
  '^(please|pls|thanks|thank you|excuse me|sorry|hello|hi|कृपया|प्लीज़?|धन्यवाद|शुक्रिया|सुनिए|माफ़ कीजिए|お願いします|おねがいします|すみません|ください|ありがとう(ございます)?|ขอบคุณ(ครับ|ค่ะ)?|ครับ|ค่ะ|หน่อย|tolong|terima kasih|permisi|maaf|cảm ơn|làm ơn|xin lỗi)$',
  'iu',
);

/**
 * A feeling that another request already answers is its reason, not a second
 * request: "it's cold, a blanket please" is one blanket; "a bag, I'm going
 * to be sick" is a sick bag.
 */
const ANSWERED_BY: Record<string, string[]> = {
  too_cold: ['blanket', 'hot_water', 'tea', 'coffee'],
  too_hot: ['water', 'ice', 'soft_drink', 'juice'],
  bag_help: ['sick_bag'],
};

/**
 * `match` is the best matcher available (the hub's keywords + e5 + classifier,
 * or keywords alone); `keywords` finds every need a part names outright
 * ("お湯と毛布" is two requests).
 */
export async function understandRequests(
  text: string,
  match: (part: string) => MatchResult | Promise<MatchResult>,
  keywords: IntentMatcher,
): Promise<UnderstoodRequests> {
  const wanted = new Map<string, UnderstoodRequest>();
  const refused = new Set<string>();
  for (const part of splitRequests(text)) {
    if (FILLER.test(part.text.replace(/[.!?。！？]+$/u, '').trim())) continue;
    const kw = keywords.match(part.text);
    const named = kw.candidates.filter((c) => c.score >= 1).map((c) => c.needId);
    const m = await match(part.text);
    const top = m.candidates[0];
    const ids = named.length ? named : top && m.confidence >= MIN_PART_CONFIDENCE ? [top.needId] : [];
    const purpose = m.purposeId ?? kw.purposeId;
    for (const id of ids) {
      if (part.refused) {
        refused.add(id);
        continue;
      }
      const confidence = named.includes(id) ? Math.max(m.confidence, 0.9) : m.confidence;
      const purposeId = purpose && getNeed(id)?.purposes?.includes(purpose) ? purpose : undefined;
      const prev = wanted.get(id);
      if (!prev || prev.confidence < confidence) wanted.set(id, { needId: id, ...(purposeId ? { purposeId } : {}), confidence });
    }
  }
  const requests = [...wanted.values()].filter(
    (r) => !refused.has(r.needId) && !(ANSWERED_BY[r.needId] ?? []).some((other) => wanted.has(other) && !refused.has(other)),
  );
  return { requests, refused: [...refused] };
}
