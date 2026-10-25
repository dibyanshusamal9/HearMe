import type { LangCode } from '@hearme/shared';

/**
 * Tuning set: natural requests a passenger might say, written independently of
 * the catalogue's keyword lists (so they test meaning, not exact phrases). Two
 * phrasings × 12 needs × 6 languages = 144.
 *
 * Deliberately the six core languages only. The vocabulary and the calibration
 * were tuned against this set, so anything in it is no longer a blind test;
 * the pack languages (Bengali, Tamil, Punjabi, Marathi) have held-out
 * sentences and nothing else, which keeps their numbers honest.
 */
export const NEED_PHRASES: Partial<Record<LangCode, Record<string, [string, string]>>> = {
  en: {
    water: ['Can I get something to drink, some water?', "I'm thirsty, could you bring me a glass of water"],
    hot_water: ['Could I have some warm water for my pills', 'I need hot water please'],
    tea: ['One cup of tea please', 'Could you bring me some chai'],
    blanket: ["It's cold, can I have a blanket", 'Do you have an extra blanket'],
    toilet: ['Where is the bathroom', 'I need to use the restroom'],
    medicine: ['I need my tablets', 'Do you have a painkiller'],
    unwell: ['I am not feeling well', 'I feel dizzy and weak'],
    meal: ["When is dinner, I'm hungry", 'Can I get something to eat'],
    too_cold: ["I'm freezing, it's too cold here", 'The cabin is very cold'],
    sick_bag: ["I think I'm going to throw up", 'I need a bag, I feel like vomiting'],
    wheelchair_arrival: ['I need a wheelchair when we land', 'Please arrange a wheelchair at the airport'],
    charger: ['My phone battery is dead, where can I charge it', 'Is there a USB port to charge my phone'],
  },
  hi: {
    water: ['मुझे पीने के लिए पानी चाहिए', 'एक गिलास पानी मिलेगा?'],
    hot_water: ['दवाई लेने के लिए गरम पानी दीजिए', 'थोड़ा गुनगुना पानी चाहिए'],
    tea: ['एक कप चाय मिलेगी?', 'मुझे चाय पीनी है'],
    blanket: ['बहुत ठंड है, कंबल दे दीजिए', 'एक और कंबल मिलेगा?'],
    toilet: ['बाथरूम कहाँ है?', 'मुझे शौचालय जाना है'],
    medicine: ['मुझे मेरी दवा चाहिए', 'सिर दर्द की गोली है क्या?'],
    unwell: ['मेरी तबीयत ठीक नहीं है', 'मुझे चक्कर आ रहे हैं'],
    meal: ['मुझे भूख लगी है, खाना कब मिलेगा?', 'कुछ खाने को मिलेगा?'],
    too_cold: ['मुझे बहुत ठंड लग रही है', 'यहाँ बहुत ठंड है'],
    sick_bag: ['मुझे उल्टी जैसा लग रहा है', 'उल्टी आ रही है, थैली दीजिए'],
    wheelchair_arrival: ['उतरने पर मुझे व्हीलचेयर चाहिए', 'एयरपोर्ट पर व्हीलचेयर का इंतज़ाम कर दीजिए'],
    charger: ['मेरा फ़ोन चार्ज करना है', 'फ़ोन की बैटरी खत्म हो गई'],
  },
  ja: {
    water: ['お水をいただけますか', '喉が渇いたので水をください'],
    hot_water: ['薬を飲むのでお湯をください', '温かいお湯を一杯ください'],
    tea: ['お茶をください', '温かいお茶はありますか'],
    blanket: ['寒いので毛布をください', '毛布をもう一枚いただけますか'],
    toilet: ['トイレはどこですか', 'お手洗いに行きたいです'],
    medicine: ['薬が欲しいです', '頭痛薬はありますか'],
    unwell: ['気分が悪いです', 'めまいがします'],
    meal: ['お腹が空きました', '食事はいつですか'],
    too_cold: ['とても寒いです', '機内が寒すぎます'],
    sick_bag: ['吐きそうです', 'エチケット袋をください'],
    wheelchair_arrival: ['到着したら車いすが必要です', '空港で車椅子をお願いします'],
    charger: ['スマホを充電したいです', '充電器はありますか'],
  },
  th: {
    water: ['ขอน้ำดื่มหน่อย', 'ขอน้ำเปล่าหนึ่งแก้ว'],
    hot_water: ['ขอน้ำร้อนไว้กินยา', 'ขอน้ำอุ่นหน่อยค่ะ'],
    tea: ['ขอชาร้อนหนึ่งแก้ว', 'มีชาไหม'],
    blanket: ['หนาวจัง ขอผ้าห่มหน่อย', 'ขอผ้าห่มเพิ่มอีกผืน'],
    toilet: ['ห้องน้ำอยู่ที่ไหน', 'อยากเข้าห้องน้ำ'],
    medicine: ['ขอยาแก้ปวดหัว', 'ต้องกินยาประจำตัว'],
    unwell: ['รู้สึกไม่สบาย', 'เวียนหัวมาก'],
    meal: ['หิวข้าวแล้ว', 'อาหารจะมาเมื่อไหร่'],
    too_cold: ['หนาวมาก', 'ในเครื่องหนาวเกินไป'],
    sick_bag: ['จะอาเจียน', 'คลื่นไส้ ขอถุงหน่อย'],
    wheelchair_arrival: ['ต้องการรถเข็นตอนลงเครื่อง', 'ขอรถเข็นที่สนามบิน'],
    charger: ['อยากชาร์จโทรศัพท์', 'แบตหมด ชาร์จได้ที่ไหน'],
  },
  id: {
    water: ['Boleh minta air minum?', 'Saya haus, minta segelas air'],
    hot_water: ['Minta air panas untuk minum obat', 'Saya perlu air hangat'],
    tea: ['Minta secangkir teh', 'Ada teh panas?'],
    blanket: ['Dingin sekali, boleh minta selimut?', 'Minta satu selimut lagi'],
    toilet: ['Toiletnya di mana?', 'Saya mau ke kamar kecil'],
    medicine: ['Saya perlu obat saya', 'Ada obat sakit kepala?'],
    unwell: ['Saya merasa tidak enak badan', 'Kepala saya pusing'],
    meal: ['Saya lapar, kapan makanan datang?', 'Boleh minta makan?'],
    too_cold: ['Saya kedinginan', 'Di sini terlalu dingin'],
    sick_bag: ['Saya mau muntah', 'Saya mual, minta kantong'],
    wheelchair_arrival: ['Saya perlu kursi roda saat tiba', 'Tolong siapkan kursi roda di bandara'],
    charger: ['Saya mau mengisi daya HP', 'Baterai ponsel saya habis'],
  },
  vi: {
    water: ['Cho tôi xin nước uống', 'Tôi khát, cho tôi một ly nước'],
    hot_water: ['Cho tôi nước nóng để uống thuốc', 'Tôi cần nước ấm'],
    tea: ['Cho tôi một tách trà', 'Có trà nóng không?'],
    blanket: ['Lạnh quá, cho tôi xin cái chăn', 'Cho tôi thêm một cái chăn'],
    toilet: ['Nhà vệ sinh ở đâu?', 'Tôi muốn đi vệ sinh'],
    medicine: ['Tôi cần thuốc của tôi', 'Có thuốc đau đầu không?'],
    unwell: ['Tôi thấy không khỏe', 'Tôi bị chóng mặt'],
    meal: ['Tôi đói rồi, khi nào có đồ ăn?', 'Cho tôi xin đồ ăn'],
    too_cold: ['Tôi thấy lạnh quá', 'Trong này lạnh quá'],
    sick_bag: ['Tôi muốn nôn', 'Tôi buồn nôn, cho tôi cái túi'],
    wheelchair_arrival: ['Tôi cần xe lăn khi hạ cánh', 'Xin chuẩn bị xe lăn ở sân bay'],
    charger: ['Tôi muốn sạc điện thoại', 'Điện thoại tôi hết pin'],
  },
};

/**
 * macOS voices used to synthesise test speech (`say -v`). macOS ships no voice
 * for Bengali, Tamil, Punjabi or Marathi, so `npm run eval -- --speech` skips
 * those languages and says so rather than quietly leaving them out. Their
 * speech numbers have to come from the voice lab with real speakers.
 */
export const VOICES: Partial<Record<LangCode, string>> = {
  en: 'Samantha',
  hi: 'Lekha',
  ja: 'Kyoko',
  th: 'Kanya',
  id: 'Damayanti',
  vi: 'Linh',
};

// Held-out and crew phrases live in @hearme/shared/lab: the voice lab uses the same sentences.
export { CREW_PHRASES, HELDOUT_PHRASES } from '@hearme/shared/lab';
