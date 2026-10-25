import type { IconName, Localized } from '../types';
import { L } from './needs';

/**
 * Picture safety briefing ("Boarding" stage in the PDF).
 *
 * SAMPLE CONTENT ONLY. Real briefings must use the airline's approved
 * wording and human-checked translations; the PDF states there is no machine
 * translation for safety. Stored locally so it works with no connection.
 */
export interface SafetyStep {
  id: string;
  icon: IconName;
  title: Localized;
  body: Localized;
}

export const SAFETY_STEPS: SafetyStep[] = [
  {
    id: 'seatbelt',
    icon: 'shield',
    title: L('Seatbelt', 'सीटबेल्ट', 'シートベルト', 'เข็มขัดนิรภัย', 'Sabuk pengaman', 'Dây an toàn'),
    body: L(
      'Keep your seatbelt fastened low and tight whenever you are seated.',
      'बैठे हों तो सीटबेल्ट हमेशा नीचे और कसकर बाँधे रखें।',
      '着席中はシートベルトを腰の低い位置でしっかりお締めください。',
      'คาดเข็มขัดให้แน่นและต่ำเสมอเมื่อนั่ง',
      'Pasang sabuk pengaman rendah dan kencang saat duduk.',
      'Luôn thắt dây an toàn thấp và chặt khi ngồi.',
    ),
  },
  {
    id: 'exits',
    icon: 'luggage',
    title: L('Exits', 'आपातकालीन द्वार', '非常口', 'ทางออกฉุกเฉิน', 'Pintu darurat', 'Lối thoát hiểm'),
    body: L(
      'Find the exit nearest to you. It may be behind you. Leave all bags behind in an emergency.',
      'अपने सबसे पास का निकास द्वार देख लें। वह पीछे भी हो सकता है। आपात स्थिति में सामान छोड़ दें।',
      '最寄りの非常口を確認してください。後方の場合もあります。緊急時は荷物を持たずに脱出してください。',
      'มองหาทางออกที่ใกล้ที่สุด อาจอยู่ด้านหลัง ในกรณีฉุกเฉินให้ทิ้งกระเป๋าไว้',
      'Cari pintu keluar terdekat, mungkin di belakang Anda. Tinggalkan tas saat darurat.',
      'Tìm lối thoát gần nhất, có thể ở phía sau. Khi khẩn cấp hãy bỏ lại hành lý.',
    ),
  },
  {
    id: 'oxygen',
    icon: 'heart-pulse',
    title: L('Oxygen mask', 'ऑक्सीजन मास्क', '酸素マスク', 'หน้ากากออกซิเจน', 'Masker oksigen', 'Mặt nạ dưỡng khí'),
    body: L(
      'If masks drop, pull one down and put it on yourself first, then help others.',
      'मास्क गिरें तो एक खींचें और पहले खुद पहनें, फिर दूसरों की मदद करें।',
      'マスクが下りてきたら引き寄せ、まずご自身に着けてから他の方を手伝ってください。',
      'หากหน้ากากหล่นลงมา ให้ดึงและสวมให้ตัวเองก่อน แล้วจึงช่วยผู้อื่น',
      'Jika masker jatuh, tarik dan pakai untuk diri sendiri dulu, lalu bantu orang lain.',
      'Nếu mặt nạ rơi xuống, kéo và đeo cho mình trước, rồi giúp người khác.',
    ),
  },
  {
    id: 'lifevest',
    icon: 'shield',
    title: L('Life vest', 'लाइफ़ जैकेट', '救命胴衣', 'เสื้อชูชีพ', 'Rompi pelampung', 'Áo phao'),
    body: L(
      'Your life vest is under your seat. Inflate it only when you leave the aircraft.',
      'लाइफ़ जैकेट आपकी सीट के नीचे है। उसे विमान से बाहर निकलते समय ही फुलाएँ।',
      '救命胴衣は座席の下にあります。膨らませるのは機外に出てからです。',
      'เสื้อชูชีพอยู่ใต้ที่นั่ง เป่าลมเมื่อออกจากเครื่องแล้วเท่านั้น',
      'Rompi pelampung ada di bawah kursi. Kembangkan hanya saat keluar pesawat.',
      'Áo phao ở dưới ghế. Chỉ thổi phồng khi đã ra khỏi máy bay.',
    ),
  },
  {
    id: 'brace',
    icon: 'armchair',
    title: L('Brace position', 'सुरक्षित मुद्रा', '衝撃防止姿勢', 'ท่ารับแรงกระแทก', 'Posisi aman', 'Tư thế chống va đập'),
    body: L(
      'If told to brace: feet flat, lean forward, head against the seat in front, hands on your head.',
      '"ब्रेस" कहा जाए तो: पैर ज़मीन पर, आगे झुकें, सिर आगे की सीट से लगाएँ, हाथ सिर पर रखें।',
      '「頭を下げて」の指示があれば、足を床につけ、前かがみになり、頭を前の座席につけ、両手を頭に。',
      'เมื่อได้ยินคำสั่ง: วางเท้าราบ โน้มตัวไปข้างหน้า ศีรษะชิดเบาะหน้า มือวางบนศีรษะ',
      'Jika diminta: kaki rata, condong ke depan, kepala di kursi depan, tangan di kepala.',
      'Khi được yêu cầu: đặt chân phẳng, cúi người, đầu tựa ghế trước, tay ôm đầu.',
    ),
  },
  {
    id: 'call',
    icon: 'bell-ring',
    title: L('Need help?', 'मदद चाहिए?', 'お困りですか？', 'ต้องการความช่วยเหลือ?', 'Butuh bantuan?', 'Cần giúp đỡ?'),
    body: L(
      'Use HearMe, press the call button, or point at the picture card in your seat pocket.',
      'HearMe इस्तेमाल करें, कॉल बटन दबाएँ, या सीट की जेब में रखा तस्वीर-कार्ड दिखाएँ।',
      'HearMeを使うか、呼び出しボタンを押すか、座席ポケットの絵カードを指さしてください。',
      'ใช้ HearMe กดปุ่มเรียก หรือชี้การ์ดรูปภาพในกระเป๋าหลังเบาะ',
      'Gunakan HearMe, tekan tombol panggil, atau tunjuk kartu gambar di kantong kursi.',
      'Dùng HearMe, bấm nút gọi, hoặc chỉ vào thẻ hình trong túi ghế.',
    ),
  },
];
