import type { Localized, ReplyId } from '../types';
import { L } from './needs';

/**
 * One-tap crew replies. The crew taps a Japanese reply; the passenger receives
 * a pre-written translation (no live machine translation). Prototype drafts:
 * all translations need human review before a pilot.
 */
export interface ReplyTemplate {
  id: ReplyId;
  text: Localized;
  /** Shown on the crew console as the button's English gloss. */
  tone: 'positive' | 'wait' | 'negative' | 'info';
  /**
   * Other ways crew naturally say this (Japanese and English). When a crew
   * member speaks instead of tapping, the hub matches the speech to the closest
   * verified reply, so the passenger only ever receives checked translations.
   */
  crewSays?: string[];
}

/** Crew speech suggests a verified reply only at this match confidence or above; crew still confirm with one tap. */
export const REPLY_SUGGEST_MIN = 0.5;

export const REPLIES: ReplyTemplate[] = [
  {
    id: 'bringing_now',
    tone: 'positive',
    crewSays: ['すぐにお持ちします', 'すぐ持ってきます', '今お持ちします', 'お持ちしますね', 'ただいまお持ちします', 'I will bring it now', 'bringing it right away'],
    text: L(
      'We are bringing it to you now.',
      'हम इसे तुरंत ला रहे हैं।',
      'すぐにお持ちします。',
      'เรากำลังนำมาให้ทันที',
      'Kami segera membawakannya.',
      'Chúng tôi đang mang đến ngay.',
    ),
  },
  {
    id: 'one_moment',
    tone: 'wait',
    crewSays: ['少々お待ちください', 'ちょっと待ってください', 'お待ちください', '少しお待ちを', 'please wait', 'just a moment'],
    text: L('One moment, please.', 'कृपया थोड़ा इंतज़ार करें।', '少々お待ちください。', 'กรุณารอสักครู่', 'Mohon tunggu sebentar.', 'Xin vui lòng chờ một chút.'),
  },
  {
    id: 'coming_to_seat',
    tone: 'positive',
    crewSays: ['お席へ伺います', '今行きます', 'そちらに参ります', 'お席に参ります', 'I am coming to your seat', 'coming now'],
    text: L(
      'A crew member is coming to your seat.',
      'क्रू सदस्य आपकी सीट पर आ रहे हैं।',
      'お席へ伺います。',
      'ลูกเรือกำลังไปที่ที่นั่งของคุณ',
      'Awak kabin sedang menuju kursi Anda.',
      'Tiếp viên đang đến ghế của bạn.',
    ),
  },
  {
    id: 'after_seatbelt',
    tone: 'wait',
    crewSays: ['ベルト着用サインが消えたら伺います', 'サインが消えたら行きます', 'after the seatbelt sign'],
    text: L(
      'We will come when the seatbelt sign is off.',
      'सीटबेल्ट का संकेत बंद होने पर हम आएँगे।',
      'シートベルト着用サインが消えたら伺います。',
      'เราจะมาเมื่อสัญญาณคาดเข็มขัดดับ',
      'Kami akan datang setelah tanda sabuk pengaman padam.',
      'Chúng tôi sẽ đến khi đèn thắt dây an toàn tắt.',
    ),
  },
  {
    id: 'not_available',
    tone: 'negative',
    crewSays: ['ご用意がありません', '申し訳ありません、ございません', 'ありません', 'sorry we do not have it'],
    text: L(
      'Sorry, we do not have this on board. A crew member will suggest something else.',
      'माफ़ कीजिए, यह विमान में उपलब्ध नहीं है। क्रू कोई और विकल्प बताएगा।',
      '申し訳ありません、機内にご用意がありません。代わりのものをご案内します。',
      'ขออภัย ไม่มีสิ่งนี้บนเครื่อง ลูกเรือจะแนะนำทางเลือกอื่น',
      'Maaf, ini tidak tersedia. Awak kabin akan menawarkan alternatif.',
      'Xin lỗi, không có trên máy bay. Tiếp viên sẽ gợi ý thứ khác.',
    ),
  },
  {
    id: 'ground_informed',
    tone: 'info',
    crewSays: ['地上係員に連絡しました', '到着地に連絡しました', 'ground staff informed'],
    text: L(
      'We have told the ground staff. Help will be waiting when we land.',
      'हमने ग्राउंड स्टाफ़ को बता दिया है। उतरने पर मदद तैयार रहेगी।',
      '地上係員に連絡しました。到着時にお手伝いします。',
      'แจ้งเจ้าหน้าที่ภาคพื้นแล้ว จะมีคนรอช่วยเมื่อลงจอด',
      'Kami sudah memberi tahu petugas darat. Bantuan akan menunggu saat mendarat.',
      'Chúng tôi đã báo nhân viên mặt đất. Sẽ có người hỗ trợ khi hạ cánh.',
    ),
  },
  {
    id: 'here_you_go',
    tone: 'positive',
    crewSays: ['どうぞ', 'お待たせしました', 'こちらです', 'here you are', 'here you go'],
    text: L('Here you are.', 'यह लीजिए।', 'お待たせいたしました。どうぞ。', 'เชิญรับได้เลย', 'Silakan.', 'Của bạn đây.'),
  },
  {
    id: 'doctor_coming',
    tone: 'info',
    crewSays: ['お医者様をお呼びします', '医師を呼びます', 'ドクターを探しています', 'we are calling a doctor'],
    text: L(
      'We are calling for a doctor. Please stay in your seat.',
      'हम डॉक्टर को बुला रहे हैं। कृपया अपनी सीट पर रहें।',
      'お医者様をお呼びしています。お席でお待ちください。',
      'เรากำลังตามแพทย์ กรุณาอยู่ที่ที่นั่ง',
      'Kami sedang memanggil dokter. Mohon tetap di kursi Anda.',
      'Chúng tôi đang gọi bác sĩ. Vui lòng ngồi tại chỗ.',
    ),
  },
  {
    id: 'stay_seated',
    tone: 'wait',
    crewSays: ['お席にお座りください', 'シートベルトをお締めください', '座っていてください', 'please stay seated'],
    text: L(
      'Please stay seated with your seatbelt fastened.',
      'कृपया सीटबेल्ट बाँधकर बैठे रहें।',
      'シートベルトを締めて、お席にお座りください。',
      'กรุณานั่งที่และคาดเข็มขัดนิรภัย',
      'Mohon tetap duduk dengan sabuk pengaman terpasang.',
      'Vui lòng ngồi yên và thắt dây an toàn.',
    ),
  },
  {
    id: 'meal_soon',
    tone: 'info',
    crewSays: ['まもなくお食事です', 'お食事はもうすぐです', 'meal is coming soon'],
    text: L(
      'The meal will be served soon.',
      'खाना जल्द ही परोसा जाएगा।',
      'まもなくお食事をお持ちします。',
      'อาหารจะเสิร์ฟในไม่ช้า',
      'Makanan akan segera disajikan.',
      'Bữa ăn sẽ được phục vụ sớm.',
    ),
  },
  {
    id: 'staff_on_arrival',
    tone: 'info',
    crewSays: ['到着後に係員がお手伝いします', '着いたら係員が来ます', 'staff will help after landing'],
    text: L(
      'Staff will help you after landing.',
      'उतरने के बाद स्टाफ़ आपकी मदद करेगा।',
      '到着後、係員がお手伝いします。',
      'เจ้าหน้าที่จะช่วยคุณหลังเครื่องลงจอด',
      'Petugas akan membantu Anda setelah mendarat.',
      'Nhân viên sẽ hỗ trợ bạn sau khi hạ cánh.',
    ),
  },
];

export function getReply(id: ReplyId): ReplyTemplate {
  return REPLIES.find((r) => r.id === id) ?? REPLIES[0]!;
}
