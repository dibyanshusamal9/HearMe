import { NEEDS, getNeed } from '../catalog/needs';
import type { NeedPurpose } from '../types';
import type { IntentMatcher, MatchResult } from './matcher';

/**
 * One sentence can hold several requests, and can refuse something:
 * "मुझे ठंडा पानी नहीं चाहिए, दवाई लेने के लिए गरम पानी चाहिए, और एक कंबल
 * चाहिए, लेकिन खाना मत भेजिए" is hot water (for medicine) and a blanket, and
 * *not* cold water or food. The sentence is split at punctuation and at
 * "and"/"but" words, each part is matched on its own, and:
 *
 *  - a refusing verb rules out every need its part names: "नहीं चाहिए",
 *    "मत भेजिए", "nahi bhejo", "don't bring", "いらない", "ไม่เอา", "jangan",
 *    "không cần", "চাই না", "வேண்டாம்", "ਨਾ ਭੇਜੋ", "नको";
 *  - a bare "not X" ("चाय नहीं", "no ice", "ไม่ใช่ชา") rules out only something
 *    to eat or drink, a blanket or a pillow: "no wifi" is a complaint;
 *  - "X instead of Y" and "X without Y" split into a wanted and a refused side.
 *
 * Catalogue phrases that carry their own negation ("no meat" is a vegetarian
 * meal, "not feeling well" is unwell, "टीवी नहीं चल रहा") are never refusals.
 */

/** Input is NFC; so must the patterns be (some Indic letters with a dot below are stored decomposed in NFC). */
const nfc = (re: RegExp) => new RegExp(re.source.normalize('NFC'), re.flags);

const AND_BUT = [
  ...['और', 'तथा', 'फिर', 'साथ ही', 'लेकिन', 'मगर', 'किंतु', 'परंतु', 'बल्कि', 'aur', 'lekin', 'magar'],
  ...['and', 'also', 'plus', 'then', 'but'],
  ...['dan', 'lalu', 'juga', 'serta', 'tapi', 'tetapi', 'namun'],
  ...['và', 'rồi', 'cùng', 'nhưng'],
  ...['আর', 'এবং', 'কিন্তু', 'তারপর'],
  ...['மற்றும்', 'ஆனால்', 'அப்புறம்', 'பிறகு'],
  ...['ਅਤੇ', 'ਪਰ', 'ਨਾਲੇ', 'ਫਿਰ'],
  ...['आणि', 'पण', 'मग'],
  ...['మరియు', 'కానీ', 'తర్వాత', 'అలాగే', 'ఆపై'],
  ...['ಮತ್ತು', 'ಆದರೆ', 'ಆಮೇಲೆ', 'ಜೊತೆಗೆ'],
  ...['പിന്നെ', 'പക്ഷേ', 'എന്നിട്ട്', 'കൂടാതെ'],
  ...['અને', 'પણ', 'પછી', 'તથા'],
  ...['ଏବଂ', 'କିନ୍ତୁ', 'ତାପରେ', 'ତା’ପରେ'],
];

// Punctuation (a full stop only at the end of a sentence), "and"/"but" words, and the space Thai writes between clauses.
const SEPARATORS = new RegExp(
  [
    '[,;،।॥!?。、，！？\\n]+',
    '\\.(?=\\s|$)',
    `\\s(?:${AND_BUT.join('|')})\\s`,
    'そして|それから|あと(?!どの|どれ|何|なん)|けど|けれど(?:も)?',
    'และ|แล้วก็|รวมถึง|แต่(?![งล])',
    '(?<=[\\u0E00-\\u0E7F])\\s+(?=[\\u0E00-\\u0E7F])',
  ]
    .join('|')
    .normalize('NFC'),
  'giu',
);

// Hindi, in Devanagari or Latin letters and often both at once ("खाना nahi भेजिए").
const HI_NOT = '(?:नहीं|नही|nahi|nahin|nahee|nhi|nai)';
const HI_VERB =
  '(?:चाहि|चाहत|चाहें|लेन|लूँग|लूंग|लुंग|लेंग|दीजि|दो|दें|देन|देंग|भेज|लाइ|लाओ|लाएँ|लाएं|लाना|खाऊ|खान|पीऊ|पीन|' +
  'chahi|chaiye|chahta|chahti|chahte|lena|lunga|lungi|lenge|dijiye|dijie|dena|do\\b|dein|bhej|lao|laiye|laie|lana|layen)';

/** A refusing verb: every need named in the same part is ruled out. */
const REFUSAL = new RegExp(
  [
    // Hindi / Hinglish
    `(?:^|\\s)${HI_NOT}\\s*${HI_VERB}`,
    `(?:^|\\s)(?:मत|mat)\\s+${HI_VERB}`,
    '(?:^|\\s)मत(?=\\s|$)',
    '(?:^|\\s)(?:न|ना|na)\\s+(?:दें|दीजि|भेज|लाएं|लाएँ|लाइ|dein|dijiye|bhej|laiye)',
    `(?:ज़रूरत|जरूरत|ज़रुरत|जरुरत|zarurat|zaroorat|jarurat|jaroorat)\\s+${HI_NOT}`,
    `(?:भूख|प्यास|bhookh|bhook|bhukh|pyaas|pyas)\\s+${HI_NOT}`,
    '(?:रहने|rehne|rahne)\\s+(?:दो|दीजि|दें|do|dijiye|dijie|den)',
    'कैंसल|कैन्सल',
    // English
    "\\b(?:don'?t|do\\s+not|doesn'?t|does\\s+not)\\s+(?:want|need|bring|give|send|serve)\\b",
    "\\b(?:won'?t|will\\s+not)\\s+(?:need|want|have|eat|drink)\\b",
    '\\b(?:no|not)\\s+(?:need|necessary|needed)\\b',
    '\\bno\\s+more\\b',
    '\\bnot\\s+(?:hungry|thirsty)\\b',
    '\\b(?:skip|cancel)\\b',
    // Japanese
    'いら(?:ない|ないです|ないで|ん)',
    'いりません|要らない|要りません|結構です|不要|欲しくない|ほしくない|たくない|(?:食べ|飲み)ません|キャンセル',
    'ないで(?:ください|下さい|くれ|$)',
    'は(?:大丈夫|結構|いい)(?:です)?(?!か)',
    // Thai
    'ไม่(?:เอา|ต้อง|อยากได้|รับ|กิน|ทาน|ดื่ม|หิว)',
    'อย่า(?!ลืม)',
    'ยกเลิก',
    // Indonesian
    '\\b(?:tidak|tak|nggak|ngga|enggak|gak|ga|gk|ndak|tdk)\\s+(?:mau|perlu|usah|butuh|ingin|pesan|minta|pakai|pake|lapar|haus)\\b',
    '\\bjangan\\b',
    '\\bbatal(?:kan|in)?\\b',
    // Vietnamese
    '(?:^|\\s)không\\s+(?:cần|muốn|lấy|uống|dùng|nhận|mang|đói|khát)(?=\\s|$)',
    '(?:^|\\s)(?:đừng|khỏi\\s+cần|hủy)(?=\\s|$)',
    // Bengali
    '(?:চাই|লাগবে|দেবেন|দিবেন|দিও|দিয়ো|পাঠাবেন|পাঠিও|পাঠাবে|আনবেন|আনবে|আনিও|খাব|খাবো|নেব|নেবো)\\s*না(?=\\s|$)',
    '(?:দরকার|প্রয়োজন|প্রয়োজন)\\s*নেই',
    // Tamil
    'வேண்டாம்|வேணாம்|தேவையில்லை|தேவை\\s+இல்லை|ாதீர்கள்|ாதீங்க',
    // Punjabi
    'ਨਹੀਂ\\s*(?:ਚਾਹੀਦ|ਚਾਹੁੰਦ|ਲੈਣਾ|ਲਵਾਂਗ|ਭੇਜ|ਦਿਓ|ਦੇਣਾ|ਲਿਆ)',
    '(?:^|\\s)ਨਾ\\s+(?:ਭੇਜ|ਦਿਓ|ਦੇਣਾ|ਦੇਵੋ|ਲਿਆ)',
    '(?:ਲੋੜ|ਜ਼ਰੂਰਤ|ਜਰੂਰਤ|ਭੁੱਖ|ਪਿਆਸ)\\s*ਨਹੀਂ',
    // Marathi
    '(?:^|\\s)(?:नको|नकोय|नकोत|नका)(?=\\s|$)',
    '(?:नाही\\s*(?:पाहिजे|हवं|हवे|हवा|हवी))|(?:(?:पाहिजे|हवं|हवे|हवा|हवी)\\s*नाही)|(?:(?:गरज|भूक)\\s*नाही)',
    // Telugu: వద్దు (don't want), అక్కర్లేదు (not needed), తేకండి / ఇవ్వకండి (don't bring / give)
    'వద్దు|అక్కర్లేదు|అక్కరలేదు|అక్కర\\s+లేదు|అవసరం\\s*లేదు|(?:ఆకలి|దాహం)\\s*(?:గా\\s*)?లేదు',
    '(?:తే|ఇవ్వ|పంప|తీసుకురా|పెట్ట)(?:కండి|కు|ద్దు)(?=\\s|$)',
    'రద్దు\\s*చేయ|క్యాన్సిల్',
    // Kannada: ಬೇಡ / ತರಬೇಡಿ (don't want / don't bring), ಬೇಕಿಲ್ಲ (not needed); not ಬೇಡಿಕೆ (a request)
    'ಬೇಡ(?!ಿಕೆ)|ಬೇಕಿಲ್ಲ|ಬೇಕಾಗಿಲ್ಲ|ಅಗತ್ಯವಿಲ್ಲ|ಅಗತ್ಯ\\s+ಇಲ್ಲ|ಅವಶ್ಯಕತೆ\\s*ಇಲ್ಲ',
    'ಹಸಿವಿಲ್ಲ|(?:ಹಸಿವು|ಬಾಯಾರಿಕೆ)\\s*(?:ಇಲ್ಲ|ಆಗುತ್ತಿಲ್ಲ)|ಕ್ಯಾನ್ಸಲ್|ರದ್ದು\\s*ಮಾಡಿ',
    // Malayalam: വേണ്ട (don't want), not വേണ്ടി (for) or വേണ്ടത് (what is needed); തരേണ്ട, കൊണ്ടുവരരുത്
    'വേണ്ട(?![\\u0D3F\\u0D24\\u0D47])|േണ്ട(?=\\s|$)|രുത്(?=\\s|$)|ആവശ്യമില്ല|ആവശ്യം\\s*ഇല്ല',
    'വിശപ്പില്ല|ദാഹമില്ല|(?:വിശപ്പ്|ദാഹം)\\s*ഇല്ല|ക്യാൻസൽ|റദ്ദാക്ക',
    // Gujarati: નથી જોઈતું (don't want), ના લાવશો (don't bring), જરૂર નથી (not needed)
    'નથી\\s*(?:જોઈ|જોઇ|જોત)|(?:જોઈ|જોઇ)(?:તું|તો|તી|તા|એ)\\s*નથી',
    '(?:^|\\s)(?:ના|નહીં|નહિ|મત)\\s+(?:લાવ|આપ|મોકલ)|(?:લાવ|આપ|મોકલ)(?:શો|તા|જો)\\s+(?:નહીં|નહિ|ના)(?=\\s|$)',
    '(?:જરૂર|ભૂખ|તરસ)\\s*નથી|કેન્સલ|રદ\\s*કરો',
    // Odia: ଦରକାର ନାହିଁ (not needed), ଚାହୁଁନି (don't want), ଆଣନ୍ତୁ ନାହିଁ (don't bring);
    // and Hindi as Whisper writes Odia speech, moved into Odia letters (ନହୀଂ ଚାହିଏ, ମତ)
    '(?:ଦରକାର|ଲୋଡ଼ା|ଲୋଡା|ଭୋକ|ଶୋଷ)\\s*ନାହ[ିୀ]|ଚାହୁଁ\\s*ନାହ[ିୀ]|ଚାହୁଁନି|ଚାହେଁନା',
    '(?:ଆଣ|ଦିଅ|ପଠା)(?:ନ୍ତୁ|ନ୍ତି|ବେ)?\\s+ନାହ[ିୀ]|(?:^|\\s)(?:ନା|ନାହିଁ)\\s+(?:ଆଣ|ଦିଅ|ପଠା)|ବାତିଲ୍?\\s*କର|କ୍ୟାନସେଲ',
    '(?:ନହୀଂ|ନହୀ)\\s*(?:ଚାହ|ଦୀଜ|ଭେଜ|ଲାଇ)|(?:^|\\s)ମତ(?=\\s|$)',
  ]
    .join('|')
    .normalize('NFC'),
  'iu',
);

/** Vietnamese typed without accents ("khong can nuoc"): checked only when the text has none. */
const REFUSAL_VI_PLAIN = /(?:^|\s)(?:khong\s+(?:can|muon|lay|uong|nhan|mang)|dung\s+(?:mang|dua|goi|lay)|khoi\s+(?:can|mang|lay))(?=\s|$)/i;

/** A bare "not X": only something to eat or drink, a blanket or a pillow is refused (see `refusableWhenNegated`). */
const NEGATED = new RegExp(
  [
    '^(?:(?:please|but|and|also|oh|so|um|uh|just)\\s+)*(?:no|not)\\s+(?!(?:problem|worries|rush|hurry|idea|way|thanks|thank|sure|working|feeling)\\b)',
    '\\s(?:नहीं|नही|nahi|nahin|nhi|ਨਹੀਂ)$',
    '^ไม่ใช่',
    '(?:じゃない|ではない)(?:です)?$',
    '^(?:bukan|tidak|tak|nggak|gak|ga)\\s+(?!(?:ada|bisa|enak|tahu)(?:\\s|$))',
    '^(?:không|khong)\\s+(?:phải\\s+|phai\\s+)?(?!(?:có|co|được|duoc|khỏe|khoe|thể|the|biết|biet|hiểu|hieu)(?:\\s|$))',
    '(?:^|\\s)(?:নয়|নয়)$', // not না: "কম্বল দিন না" is a polite "please give"
    '(?:^|\\s)(?:కాదు|ಅಲ್ಲ|അല്ല|ନୁହେଁ)$',
    '\\s(?:નહીં|નહિ|ନହୀଂ)$',
  ]
    .join('|')
    .normalize('NFC'),
  'iu',
);

/** "Y instead of X", "X without Y": the side that is refused. */
const SIDES: [RegExp, 'before' | 'after'][] = (
  [
    // Not "I can't sleep without a pillow": that needs the pillow.
    [/(?<!\b(?:can'?t|cannot|can\s+not|unable)\b.*)\b(?:instead\s+of|rather\s+than|with\s+no|without)\b/i, 'after'],
    [/\s(?:की जगह|के बजाय|की बजाय|के बदले)\s/u, 'before'],
    [/じゃなくて|ではなくて|ではなく|じゃなく/u, 'before'],
    [/ไม่ใส่/u, 'after'],
    [/\sthay vì\s/iu, 'after'],
    [/(?<!\btidak\s+bisa\b.*)(?:^|\s)(?:bukan|daripada|tanpa)\s/iu, 'after'],
  ] satisfies [RegExp, 'before' | 'after'][]
).map(([re, side]) => [nfc(re), side]);

/**
 * "बिना बर्फ़ के पानी", "বরফ ছাড়া জল", "ミルクなしで": the captured words are refused,
 * the rest is wanted. Not used when the part also says "not" ("तकिये के बिना सो
 * नहीं सकता" needs the pillow).
 */
const WITHOUT: RegExp[] = [
  /(?:^|\s)(?:बिना|bina)\s+(\S+(?:\s+\S+)?)\s+(?:की|के|का|ki|ke|ka)(?=\s|$)/u,
  /(?:^|\s)(\S+(?:\s+\S+)?)\s+(?:के|ke)\s+(?:बिना|bina)(?=\s|$)/u,
  /(?:^|\s)(\S+)\s+ছাড়া(?=\s|$)/u,
  /(?:^|\s)(\S+)\s+இல்லாமல்(?=\s|$)/u,
  /(?:^|\s)(\S+)\s+(?:ਤੋਂ\s+)?ਬਿਨਾਂ(?=\s|$)/u,
  /(?:^|\s)(\S+?)\s*(?:शिवाय|विना)(?=\s|$)/u,
  /(?:^|\s)(\S+)\s+లేకుండా(?=\s|$)/u,
  /(?:^|\s)(\S+)\s+ಇಲ್ಲದೆ(?=\s|$)/u,
  /(?:^|\s)(\S+)\s+ഇല്ലാതെ(?=\s|$)/u,
  /(?:^|\s)(\S+)\s+(?:વગર|વિના)(?:નું|ના|ની|નો)?(?=\s|$)/u,
  /(?:^|\s)(\S+)\s+(?:ବିନା|ଛଡ଼ା|ଛଡା)(?=\s|$)/u,
  /((?:(?![をはがのとにでもへや])[\u3041-\u3096\u30A0-\u30FF\u4E00-\u9FFF])+)(?:抜き|なし|無し)(?:で|の)?/u,
].map(nfc);
const CANT = /नहीं|नही|nahi|না|ਨਹੀਂ|नाही|இல்லை|ில்லை|முடியா|లేదు|లేను|ಇಲ್ಲ(?![ದಿ])|ಆಗಲ್ಲ|ಲಾರೆ|ഇല്ല(?!ാതെ)|ില്ല|പറ്റില്ല|નથી|નહીં|નહિ|શકત|ନାହ[ିୀ]|ପାରୁନ|ନହୀଂ/u;

const NEGATION_CUE = /(?:^|\s)(?:no|not|can'?t|without)(?:\s|$)|なし|ない|ไม่|tanpa|tidak|không|khong|नहीं|नही|नाही|ਨਹੀਂ|না|இல்லை|வேண்டாம்|ாத|ில்லை|లేదు|లేను|వద్దు|కాదు|ಇಲ್ಲ|ಬೇಡ|ಅಲ್ಲ|ഇല്ല|ില്ല|വേണ്ട|അല്ല|નથી|નહીં|નહિ|ନାହ[ିୀ]|ନୁହେଁ|ନହୀଂ/iu;

/** Fold accents away one character at a time, so positions in the folded text match the original. */
function fold(s: string): string {
  let out = '';
  for (const c of s.split('')) out += (c.normalize('NFD')[0] ?? c).replace(/[đĐ]/, 'd').toLowerCase()[0] ?? c;
  return out;
}

let ownNegation: string[] | undefined;
/** Catalogue phrases with a negation of their own ("no meat", "not feeling well"), longest first. */
function ownNegationPhrases(): string[] {
  ownNegation ??= [
    ...new Set(
      NEEDS.flatMap((n) => [...Object.values(n.phrases), ...Object.values(n.hints ?? {})].flat())
        .filter((p): p is string => typeof p === 'string' && NEGATION_CUE.test(p))
        .map((p) => fold(p.normalize('NFC'))),
    ),
  ].sort((a, b) => b.length - a.length);
  return ownNegation;
}

/** The text with those phrases blanked out (same length), for finding refusals. */
function probe(text: string): string {
  const folded = fold(text);
  let out = text;
  for (const p of ownNegationPhrases()) {
    for (let i = folded.indexOf(p); i >= 0; i = folded.indexOf(p, i + p.length)) {
      out = out.slice(0, i) + '_'.repeat(p.length) + out.slice(i + p.length);
    }
  }
  return out;
}

function refuses(probed: string): boolean {
  return REFUSAL.test(probed) || (!/[̀-ͯ]|[đĐ]/.test(probed.normalize('NFD')) && REFUSAL_VI_PLAIN.test(probed));
}

const QUOTES = /^[\s"'“”‘’„«»「」『』()[\]]+|[\s"'“”‘’„«»「」『』()[\].!?。！？]+$/gu;

export interface RequestPart {
  text: string;
  /** Says it does not want something: every need this part names is refused. */
  refused: boolean;
  /** A bare "not X": only something to eat or drink, a blanket or a pillow named here is refused. */
  negated: boolean;
}

export function splitRequests(text: string): RequestPart[] {
  const parts: RequestPart[] = [];
  const add = (raw: string, refused?: boolean) => {
    const t = raw.replace(QUOTES, '').trim();
    if (!/\p{L}/u.test(t)) return;
    const p = probe(t);
    const r = refused ?? refuses(p);
    parts.push({
      text: t,
      refused: r,
      negated: refused === undefined && !r && NEGATED.test(p),
    });
  };
  for (const chunk of text.normalize('NFC').split(SEPARATORS)) {
    const c = chunk?.replace(QUOTES, '').trim();
    if (!c) continue;
    const p = probe(c);
    const side = SIDES.map(([re, which]) => ({ m: re.exec(p), which })).find((s) => s.m);
    if (side?.m) {
      add(c.slice(0, side.m.index), side.which === 'before');
      add(c.slice(side.m.index + side.m[0].length), side.which === 'after');
      continue;
    }
    const without = CANT.test(p) ? undefined : WITHOUT.map((re) => re.exec(p)).find((m) => m);
    if (without) {
      add(c.slice(0, without.index) + ' ' + c.slice(without.index + without[0].length));
      add(without[1]!, true);
      continue;
    }
    add(c);
  }
  return parts;
}

/** Whether a sentence needs matching part by part: it holds more than one request, or refuses something. */
export function mayHoldSeveral(text: string): boolean {
  const parts = splitRequests(text);
  return parts.length > 1 || parts.some((p) => p.refused || p.negated);
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

/** Politeness, or a bare yes/no, on its own is not a request ("please" is not "call the crew"). */
const FILLER = new RegExp(
  '^(please|pls|thanks|thank you|excuse me|sorry|hello|hi|no|yes|ok|okay|no thanks|no thank you|nothing( else)?|' +
    'कृपया|प्लीज़?|धन्यवाद|शुक्रिया|सुनिए|माफ़ कीजिए|नहीं|हाँ|हां|बस|ठीक है|' +
    'お願いします|おねがいします|すみません|ください|ありがとう(ございます)?|いいえ|はい|' +
    'ขอบคุณ(ครับ|ค่ะ)?|ครับ|ค่ะ|หน่อย|ไม่(ครับ|ค่ะ)?|' +
    'tolong|terima kasih|permisi|maaf|tidak|nggak|gak|ya|cảm ơn|làm ơn|xin lỗi|không|vâng|' +
    'না|হ্যাঁ|ধন্যবাদ|இல்லை|ஆம்|நன்றி|ਨਹੀਂ|ਹਾਂ|ਧੰਨਵਾਦ|नाही|हो|धन्यवाद)$'.normalize('NFC'),
  'iu',
);

/**
 * A need another request already covers is not a second request. A feeling
 * is the reason for what answers it ("it's cold, a blanket please" is one
 * blanket; "a bag, I'm going to be sick" is a sick bag), and food is covered
 * by the vegetarian meal or baby food asked for with it.
 */
const COVERED_BY: Record<string, string[]> = {
  too_cold: ['blanket', 'hot_water', 'tea', 'coffee'],
  too_hot: ['water', 'ice', 'soft_drink', 'juice'],
  bag_help: ['sick_bag'],
  meal: ['veg_meal', 'baby_food'],
};

/**
 * Named in the same part, one need covers the other: "heat some water" is hot
 * water, not water as well; "headache tablets" is medicine, the headache is why.
 */
const COVERED_IN_PART: Record<string, string[]> = {
  water: ['hot_water'],
  meal: ['veg_meal', 'baby_food'],
  unwell: ['medicine'],
};

/** What a bare "not X" can refuse. "No wifi" or "TV नहीं चल रहा" is a complaint, and "no nuts" is an allergy. */
function refusableWhenNegated(needId: string): boolean {
  const need = getNeed(needId);
  if (!need || needId === 'allergy') return false;
  return need.category === 'drinks' || need.category === 'food' || needId === 'blanket' || needId === 'pillow';
}

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
  // "ওষুধটা খাব, একটু গরম জল হবে?": a purpose said in a part of its own goes with the need that takes it.
  let loosePurpose: NeedPurpose['id'] | undefined;
  for (const part of splitRequests(text)) {
    if (FILLER.test(part.text.replace(/[.!?。！？]+$/u, '').trim())) continue;
    const kw = keywords.match(part.text);
    const named = kw.candidates.filter((c) => c.score >= 1).map((c) => c.needId);
    const m = await match(part.text);
    const top = m.candidates[0];
    const found = named.length ? named : top && m.confidence >= MIN_PART_CONFIDENCE ? [top.needId] : [];
    const ids = found.filter((id) => !(COVERED_IN_PART[id] ?? []).some((other) => found.includes(other)));
    const purpose = m.purposeId ?? kw.purposeId;
    if (!ids.length && purpose && !part.refused) loosePurpose ??= purpose;
    for (const id of ids) {
      if (part.refused || (part.negated && refusableWhenNegated(id))) {
        refused.add(id);
        continue;
      }
      // Named outright, it is sure, unless the meaning model heard something else ("heat some water" is not water): then the passenger ticks it.
      const confidence = named.includes(id) && m.evidence !== 'disagree' ? Math.max(m.confidence, 0.9) : m.confidence;
      const purposeId = purpose && getNeed(id)?.purposes?.includes(purpose) ? purpose : undefined;
      const prev = wanted.get(id);
      if (!prev || prev.confidence < confidence)
        wanted.set(id, {
          needId: id,
          ...(purposeId ? { purposeId } : {}),
          confidence,
        });
    }
  }
  if (loosePurpose) for (const r of wanted.values()) if (!r.purposeId && getNeed(r.needId)?.purposes?.includes(loosePurpose)) r.purposeId = loosePurpose;
  const requests = [...wanted.values()].filter(
    (r) => !refused.has(r.needId) && !(COVERED_BY[r.needId] ?? []).some((other) => wanted.has(other) && !refused.has(other)),
  );
  return { requests, refused: [...refused] };
}
