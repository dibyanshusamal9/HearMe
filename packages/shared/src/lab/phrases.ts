import type { LangCode, ReplyId } from '../types';

/**
 * Held-out phrases: written after the vocabulary and calibration were tuned
 * on NEED_PHRASES (apps/hub/src/scripts/evalData.ts), and never used for
 * tuning. One phrasing × 12 needs × 10 languages = 120. Report these numbers
 * as the honest estimate. `npm run eval` scores them typed; the voice lab has
 * real people read the same sentences, so the two can be compared directly.
 *
 * The same 12 needs in every language, so languages can be compared with each
 * other rather than only with themselves.
 *
 * READ THIS BEFORE QUOTING THE PACK LANGUAGES (bn, ta, pa, mr): their pack
 * vocabulary and these sentences were written by the same author, so some
 * words inevitably overlap and the numbers are optimistic in a way the six
 * core languages' are not. They are a regression check and a comparison
 * between languages, not an independent accuracy claim. The honest fix is a
 * native speaker writing a fresh set — that is in the remaining work.
 */
export const HELDOUT_PHRASES: Partial<Record<LangCode, Record<string, string>>> = {
  en: {
    water: 'Some water for me, please',
    hot_water: 'Could you heat some water for me',
    tea: "I'd love a hot tea",
    blanket: 'Could I get a blanket to keep warm',
    toilet: "Excuse me, where's the toilet",
    medicine: 'I have to take my medication now',
    unwell: 'I feel really sick',
    meal: 'Is there any food available',
    too_cold: 'It is really chilly in here',
    sick_bag: 'I feel nauseous',
    wheelchair_arrival: 'My mother needs a wheelchair after landing',
    charger: 'Can I charge my mobile somewhere',
  },
  hi: {
    water: 'पानी मिल सकता है?',
    hot_water: 'मुझे गर्म पानी की ज़रूरत है',
    tea: 'चाय मिल जाएगी क्या?',
    blanket: 'मुझे ओढ़ने के लिए कंबल चाहिए',
    toilet: 'टॉयलेट किधर है?',
    medicine: 'मुझे दवाई लेनी है',
    unwell: 'मेरी तबीयत खराब है',
    meal: 'खाना कब आएगा?',
    too_cold: 'बहुत सर्दी लग रही है',
    sick_bag: 'मुझे उल्टी होने वाली है',
    wheelchair_arrival: 'मुझे व्हीलचेयर की ज़रूरत होगी',
    charger: 'मोबाइल चार्ज करना है',
  },
  ja: {
    water: '水を一杯お願いします',
    hot_water: 'お湯を少しいただけますか',
    tea: '緑茶をお願いします',
    blanket: 'ブランケットを貸してください',
    toilet: 'トイレに行きたいです',
    medicine: '薬を飲みたいです',
    unwell: '具合が悪いです',
    meal: '何か食べるものはありますか',
    too_cold: '寒くて眠れません',
    sick_bag: '気持ち悪くて吐きそうです',
    wheelchair_arrival: '降りるときに車いすをお願いします',
    charger: '携帯の充電はできますか',
  },
  th: {
    water: 'ขอน้ำหน่อยครับ',
    hot_water: 'ขอน้ำร้อนหนึ่งแก้ว',
    tea: 'ขอชาหนึ่งถ้วย',
    blanket: 'ขอผ้าห่มหน่อยค่ะ',
    toilet: 'ขอไปห้องน้ำหน่อย',
    medicine: 'ขอยาหน่อย',
    unwell: 'ไม่ค่อยสบาย',
    meal: 'มีอะไรให้กินไหม',
    too_cold: 'หนาวจังเลย',
    sick_bag: 'รู้สึกคลื่นไส้',
    wheelchair_arrival: 'ต้องการรถเข็นที่ปลายทาง',
    charger: 'ขอชาร์จแบตโทรศัพท์',
  },
  id: {
    water: 'Minta air putih, ya',
    hot_water: 'Bisa minta air panas?',
    tea: 'Saya mau teh',
    blanket: 'Bisa minta selimut?',
    toilet: 'Saya mau ke toilet',
    medicine: 'Saya harus minum obat sekarang',
    unwell: 'Badan saya tidak enak',
    meal: 'Kapan makan malam?',
    too_cold: 'Dingin sekali di sini',
    sick_bag: 'Saya merasa mual',
    wheelchair_arrival: 'Saya butuh kursi roda setelah mendarat',
    charger: 'Di mana saya bisa mengecas ponsel?',
  },
  vi: {
    water: 'Cho tôi ít nước',
    hot_water: 'Cho tôi xin nước nóng',
    tea: 'Tôi muốn uống trà',
    blanket: 'Cho tôi mượn cái chăn',
    toilet: 'Nhà vệ sinh ở chỗ nào?',
    medicine: 'Tôi cần uống thuốc bây giờ',
    unwell: 'Tôi bị mệt',
    meal: 'Khi nào có bữa ăn?',
    too_cold: 'Lạnh quá',
    sick_bag: 'Tôi thấy buồn nôn',
    wheelchair_arrival: 'Tôi cần xe lăn sau khi hạ cánh',
    charger: 'Tôi có thể sạc điện thoại ở đâu?',
  },
  // ── Pack languages ─────────────────────────────────────────────────────
  bn: {
    water: 'তেষ্টা পেয়েছে, এক গ্লাস জল দিন',
    hot_water: 'ওষুধটা খাব, একটু গরম জল হবে?',
    tea: 'এক কাপ চা হলে ভালো হয়',
    blanket: 'আর একটা কম্বল দিন না',
    toilet: 'শৌচাগারটা কোন দিকে?',
    medicine: 'আমার ওষুধটা খেতে হবে',
    unwell: 'শরীরটা ভালো যাচ্ছে না',
    meal: 'খাবার কখন দেবেন?',
    too_cold: 'এখানে বেশ ঠান্ডা লাগছে',
    sick_bag: 'বমি পাচ্ছে, একটা থলি দিন',
    wheelchair_arrival: 'নামার পরে হুইলচেয়ার লাগবে',
    charger: 'ফোনটা চার্জ দেওয়া যাবে কোথায়?',
  },
  ta: {
    water: 'தாகமாக இருக்கிறது, ஒரு டம்ளர் தண்ணீர் கொடுங்கள்',
    hot_water: 'மாத்திரை சாப்பிட வெந்நீர் கிடைக்குமா?',
    tea: 'ஒரு டீ கொடுங்கள்',
    blanket: 'இன்னொரு போர்வை வேண்டும்',
    toilet: 'டாய்லெட் எந்தப் பக்கம்?',
    medicine: 'எனக்கு மாத்திரை வேண்டும்',
    unwell: 'உடம்பு சரியில்லை',
    meal: 'சாப்பாடு எப்போது கொடுப்பீர்கள்?',
    too_cold: 'இங்கே ரொம்ப குளிராக இருக்கிறது',
    sick_bag: 'வாந்தி வரும் போல இருக்கிறது, பை கொடுங்கள்',
    wheelchair_arrival: 'இறங்கியபின் வீல்சேர் வேண்டும்',
    charger: 'போன் சார்ஜ் செய்ய இடம் இருக்கிறதா?',
  },
  pa: {
    water: 'ਪਿਆਸ ਲੱਗੀ ਹੈ, ਇੱਕ ਗਿਲਾਸ ਪਾਣੀ ਦੇ ਦਿਓ',
    hot_water: 'ਦਵਾਈ ਖਾਣੀ ਹੈ, ਕੋਸਾ ਪਾਣੀ ਮਿਲੇਗਾ?',
    tea: 'ਇੱਕ ਕੱਪ ਚਾਹ ਬਣਾ ਦਿਓ',
    blanket: 'ਇੱਕ ਹੋਰ ਕੰਬਲ ਦੇ ਦਿਓ',
    toilet: 'ਬਾਥਰੂਮ ਕਿਹੜੇ ਪਾਸੇ ਹੈ?',
    medicine: 'ਮੈਨੂੰ ਗੋਲੀ ਖਾਣੀ ਹੈ',
    unwell: 'ਸਰੀਰ ਠੀਕ ਨਹੀਂ ਲੱਗ ਰਿਹਾ',
    meal: 'ਖਾਣਾ ਕਦੋਂ ਮਿਲੇਗਾ?',
    too_cold: 'ਇੱਥੇ ਬੜੀ ਠੰਢ ਹੈ',
    sick_bag: 'ਉਲਟੀ ਆਉਣ ਵਾਲੀ ਹੈ, ਥੈਲਾ ਦਿਓ',
    wheelchair_arrival: 'ਉਤਰਨ ਤੋਂ ਬਾਅਦ ਵੀਲ੍ਹਚੇਅਰ ਚਾਹੀਦੀ ਹੈ',
    charger: 'ਫ਼ੋਨ ਚਾਰਜ ਕਿੱਥੇ ਕਰ ਸਕਦਾ ਹਾਂ?',
  },
  mr: {
    water: 'तहान लागली आहे, एक ग्लास पाणी द्या',
    hot_water: 'औषध घ्यायचे आहे, कोमट पाणी मिळेल का?',
    tea: 'एक कप चहा द्या',
    blanket: 'अजून एक पांघरूण द्या',
    toilet: 'बाथरूम कुठल्या बाजूला आहे?',
    medicine: 'मला गोळी घ्यायची आहे',
    unwell: 'अंग बरे वाटत नाही',
    meal: 'जेवण कधी मिळेल?',
    too_cold: 'इथे खूप गार वाटत आहे',
    sick_bag: 'उलटी होईल असे वाटते, पिशवी द्या',
    wheelchair_arrival: 'उतरल्यानंतर व्हीलचेअर पाहिजे',
    charger: 'फोन चार्ज कुठे करू?',
  },
};

/** Things a Japanese crew member might say instead of tapping a reply. */
export const CREW_PHRASES: [string, ReplyId][] = [
  ['すぐ持ってきますね', 'bringing_now'],
  ['今お持ちしますので', 'bringing_now'],
  ['ちょっとお待ちくださいね', 'one_moment'],
  ['少しお待ちいただけますか', 'one_moment'],
  ['今そちらに行きます', 'coming_to_seat'],
  ['すぐお席に伺いますね', 'coming_to_seat'],
  ['申し訳ございません、それはご用意がないんです', 'not_available'],
  ['今お医者さんを探しています', 'doctor_coming'],
  ['席に座ってベルトを締めてください', 'stay_seated'],
  ['お食事はもう少しでお持ちします', 'meal_soon'],
  ['はい、どうぞ', 'here_you_go'],
  ['ベルトサインが消えたらお持ちします', 'after_seatbelt'],
  ['着いたら空港の係員が手伝います', 'staff_on_arrival'],
  ['空港のスタッフに連絡しておきました', 'ground_informed'],
];
