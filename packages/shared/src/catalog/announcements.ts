import { fallbackLang } from '../i18n/languages';
import type { Announcement, IconName, LangCode, Localized } from '../types';
import { L } from './needs';
import { ANNOUNCEMENT_TRANSLATIONS } from './announcementTranslations';

/**
 * Pre-translated announcement captions the crew can push to passengers.
 * Per the PDF, safety messages are checked by people and never machine
 * translated, so captions are fixed templates, not live transcription.
 * Prototype drafts: translations need review by the airline.
 */
export interface AnnouncementTemplate {
  id: string;
  icon: IconName;
  /** Safety-related captions are visually emphasised. */
  safety: boolean;
  text: Localized;
}

const CORE_ANNOUNCEMENTS: AnnouncementTemplate[] = [
  {
    id: 'seatbelt_on',
    icon: 'shield',
    safety: true,
    text: L(
      'The seatbelt sign is on. Please return to your seat and fasten your seatbelt.',
      'सीटबेल्ट का संकेत चालू है। कृपया अपनी सीट पर लौटें और सीटबेल्ट बाँधें।',
      'シートベルト着用サインが点灯しました。お席に戻り、シートベルトをお締めください。',
      'สัญญาณคาดเข็มขัดนิรภัยเปิดแล้ว กรุณากลับไปที่นั่งและคาดเข็มขัด',
      'Tanda sabuk pengaman menyala. Silakan kembali ke kursi dan pasang sabuk pengaman.',
      'Đèn thắt dây an toàn đã bật. Vui lòng về chỗ và thắt dây an toàn.',
    ),
  },
  {
    id: 'turbulence',
    icon: 'shield',
    safety: true,
    text: L(
      'We are expecting some turbulence. Please stay seated with your seatbelt fastened.',
      'कुछ हलचल (टर्बुलेंस) की संभावना है। कृपया सीटबेल्ट बाँधकर बैठे रहें।',
      '揺れが予想されます。シートベルトを締めてお座りください。',
      'คาดว่าจะมีสภาพอากาศแปรปรวน กรุณานั่งและคาดเข็มขัดไว้',
      'Akan ada sedikit turbulensi. Tetap duduk dengan sabuk pengaman terpasang.',
      'Sắp có nhiễu động. Vui lòng ngồi yên và thắt dây an toàn.',
    ),
  },
  {
    id: 'meal_service',
    icon: 'utensils',
    safety: false,
    text: L(
      'Meal service will begin shortly.',
      'जल्द ही भोजन परोसा जाएगा।',
      'まもなくお食事のサービスを始めます。',
      'จะเริ่มให้บริการอาหารในไม่ช้า',
      'Layanan makan akan segera dimulai.',
      'Sắp bắt đầu phục vụ suất ăn.',
    ),
  },
  {
    id: 'duty_free',
    icon: 'shopping-bag',
    safety: false,
    text: L(
      'Duty-free sales will begin in a few minutes.',
      'कुछ मिनटों में ड्यूटी-फ़्री बिक्री शुरू होगी।',
      'まもなく免税品の販売を始めます。',
      'การจำหน่ายสินค้าปลอดภาษีจะเริ่มในอีกไม่กี่นาที',
      'Penjualan bebas bea akan dimulai beberapa menit lagi.',
      'Bán hàng miễn thuế sẽ bắt đầu sau ít phút.',
    ),
  },
  {
    id: 'descent',
    icon: 'armchair',
    safety: true,
    text: L(
      'We are starting our descent. Please return your seat to the upright position and fasten your seatbelt.',
      'विमान नीचे उतरना शुरू कर रहा है। कृपया सीट सीधी करें और सीटबेल्ट बाँधें।',
      '降下を開始します。座席の背もたれを元に戻し、シートベルトをお締めください。',
      'เครื่องกำลังลดระดับ กรุณาปรับพนักพิงให้ตรงและคาดเข็มขัด',
      'Kita mulai turun. Tegakkan sandaran kursi dan pasang sabuk pengaman.',
      'Máy bay bắt đầu hạ độ cao. Vui lòng dựng thẳng lưng ghế và thắt dây an toàn.',
    ),
  },
  {
    id: 'arrived',
    icon: 'luggage',
    safety: false,
    text: L(
      'Welcome to Tokyo. Please stay seated until the seatbelt sign is off.',
      'टोक्यो में आपका स्वागत है। सीटबेल्ट का संकेत बंद होने तक बैठे रहें।',
      '東京へようこそ。シートベルト着用サインが消えるまでお座りください。',
      'ยินดีต้อนรับสู่โตเกียว กรุณานั่งจนกว่าสัญญาณคาดเข็มขัดจะดับ',
      'Selamat datang di Tokyo. Tetap duduk sampai tanda sabuk pengaman padam.',
      'Chào mừng đến Tokyo. Vui lòng ngồi yên đến khi đèn thắt dây an toàn tắt.',
    ),
  },
  {
    id: 'doctor_call',
    icon: 'stethoscope',
    safety: true,
    text: L(
      'Is there a doctor or nurse on board? If so, please tell the cabin crew.',
      'क्या विमान में कोई डॉक्टर या नर्स हैं? कृपया केबिन क्रू को बताएँ।',
      '機内にお医者様または看護師の方はいらっしゃいませんか。乗務員までお知らせください。',
      'มีแพทย์หรือพยาบาลบนเครื่องไหม หากมี กรุณาแจ้งลูกเรือ',
      'Apakah ada dokter atau perawat di pesawat? Jika ada, mohon beri tahu awak kabin.',
      'Có bác sĩ hoặc y tá nào trên máy bay không? Nếu có, xin báo cho tiếp viên.',
    ),
  },
];

export const ANNOUNCEMENTS: AnnouncementTemplate[] = CORE_ANNOUNCEMENTS.map(template => ({
  ...template,
  text: { ...template.text, ...ANNOUNCEMENT_TRANSLATIONS[template.id] },
}));

export function getAnnouncement(id: string): AnnouncementTemplate | undefined {
  return ANNOUNCEMENTS.find((a) => a.id === id);
}

/** What one seat shows (and reads aloud) for an announcement, in its own language where there is one. */
export interface Caption {
  text: string;
  /** The language `text` is written in: the seat's own, or the one it falls back to. */
  lang: string;
  icon: IconName;
  safety: boolean;
  /** Machine-translated own words: the passenger is told so. */
  machine: boolean;
  sender?: 'captain' | 'crew';
}

export function captionOf(a: Pick<Announcement, 'templateId' | 'broadcast'>, lang: LangCode): Caption | undefined {
  const b = a.broadcast;
  if (b) {
    const sourceLang = b.sourceLang ?? 'ja';
    const shown = [lang, fallbackLang(lang), 'en'].find((l) => b.texts[l]);
    return {
      text: shown ? b.texts[shown]! : b.original,
      lang: shown ?? sourceLang,
      icon: b.sender === 'captain' ? 'plane-takeoff' : 'bell-ring',
      safety: false,
      machine: shown !== undefined && shown !== sourceLang,
      sender: b.sender,
    };
  }
  const tpl = getAnnouncement(a.templateId);
  if (!tpl) return undefined;
  const own = tpl.text[lang];
  const fb = fallbackLang(lang);
  return { text: own ?? tpl.text[fb], lang: own ? lang : fb, icon: tpl.icon, safety: tpl.safety, machine: false };
}
