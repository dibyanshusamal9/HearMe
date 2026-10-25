import { LOCALE_PACKS } from '../i18n/packs';
import type { Localized, Need, NeedCategory, NeedPurpose } from '../types';

/** Build a Localized record in a fixed order: en, hi, ja, th, id, vi. */
export function L(en: string, hi: string, ja: string, th: string, id: string, vi: string): Localized {
  return { en, hi, ja, th, id, vi };
}

/**
 * Fold every language pack's vocabulary into the catalogue, so one `NEEDS`
 * array carries all ten languages. The matcher, the trained classifier's
 * training data and the e5 description index all read from it, which is why a
 * pack language is understood on a phone with no hub as well as on the hub.
 */
function withPackVocabulary(needs: Need[]): Need[] {
  if (!LOCALE_PACKS.length) return needs;
  return needs.map((need) => {
    const phrases = { ...need.phrases } as Record<string, string[]>;
    const hints = { ...(need.hints ?? {}) } as Record<string, string[]>;
    for (const pack of LOCALE_PACKS) {
      const p = pack.phrases[need.id];
      if (p?.length) phrases[pack.code] = p;
      const h = pack.hints?.[need.id];
      if (h?.length) hints[pack.code] = h;
    }
    return { ...need, phrases: phrases as Need['phrases'], ...(Object.keys(hints).length ? { hints: hints as Need['hints'] } : {}) };
  });
}

/**
 * The needs catalogue.
 *
 * The PDF says most cabin requests are "the same 64 things" and that the
 * hackathon prototype targets 40. This prototype ships those 40; adding a
 * need is data only (label in 6 languages + matching phrases).
 * Japanese labels are what the crew tablet shows (the demo route is a Japanese carrier).
 */
const CATALOGUE: Need[] = [
  // ── Drinks ─────────────────────────────────────────────────────────────
  {
    id: 'water',
    category: 'drinks',
    icon: 'glass-water',
    common: true,
    purposes: ['for_medicine'],
    label: L('Water', 'पानी', 'お水', 'น้ำเปล่า', 'Air putih', 'Nước lọc'),
    phrases: {
      en: ['water', 'drinking water', 'cold water'],
      hi: ['पानी', 'paani', 'pani', 'ठंडा पानी'],
      ja: ['水', 'お水', 'みず'],
      th: ['น้ำเปล่า', 'น้ำดื่ม'],
      id: ['air putih', 'air minum'],
      vi: ['nuoc loc', 'nuoc uong'],
    },
    hints: { en: ['drink', 'thirsty'], hi: ['प्यास'], ja: ['飲み物'], th: ['หิวน้ำ'], id: ['haus'], vi: ['khat'] },
  },
  {
    id: 'hot_water',
    category: 'drinks',
    icon: 'coffee',
    common: true,
    purposes: ['for_medicine', 'for_child'],
    label: L('Hot water', 'गरम पानी', 'お湯', 'น้ำร้อน', 'Air panas', 'Nước nóng'),
    phrases: {
      en: ['hot water', 'warm water'],
      hi: ['गरम पानी', 'गर्म पानी', 'गुनगुना', 'garam pani', 'garam paani'],
      ja: ['お湯', 'おゆ', '白湯'],
      th: ['น้ำร้อน', 'น้ำอุ่น'],
      id: ['air panas', 'air hangat'],
      vi: ['nuoc nong', 'nuoc am'],
    },
    hints: { en: ['hot', 'warm'], hi: ['गरम', 'गर्म', 'garam'], ja: ['熱い', '温かい'], th: ['ร้อน', 'อุ่น'], id: ['panas', 'hangat'], vi: ['nong'] },
  },
  {
    id: 'tea',
    category: 'drinks',
    icon: 'leaf',
    common: true,
    label: L('Tea', 'चाय', 'お茶', 'ชา', 'Teh', 'Trà'),
    phrases: { en: ['tea', 'chai'], hi: ['चाय', 'चाए', 'chai', 'chaay'], ja: ['お茶', '紅茶', '緑茶'], th: ['น้ำชา', 'ชาร้อน'], id: ['teh'], vi: ['tra'] },
    hints: { en: ['hot', 'warm'], hi: ['गरम', 'गर्म', 'garam'], ja: ['温かい'], th: ['อุ่น'], id: ['hangat'] },
  },
  {
    id: 'coffee',
    category: 'drinks',
    icon: 'coffee',
    label: L('Coffee', 'कॉफ़ी', 'コーヒー', 'กาแฟ', 'Kopi', 'Cà phê'),
    phrases: { en: ['coffee'], hi: ['कॉफ़ी', 'कॉफी', 'coffee'], ja: ['コーヒー'], th: ['กาแฟ'], id: ['kopi'], vi: ['ca phe'] },
  },
  {
    id: 'juice',
    category: 'drinks',
    icon: 'cup-soda',
    label: L('Juice', 'जूस', 'ジュース', 'น้ำผลไม้', 'Jus', 'Nước ép'),
    phrases: { en: ['juice', 'orange juice', 'apple juice'], hi: ['जूस', 'juice'], ja: ['ジュース'], th: ['น้ำผลไม้', 'น้ำส้ม'], id: ['jus'], vi: ['nuoc ep'] },
  },
  {
    id: 'milk',
    category: 'drinks',
    icon: 'milk',
    purposes: ['for_child'],
    label: L('Milk', 'दूध', '牛乳', 'นม', 'Susu', 'Sữa'),
    phrases: { en: ['milk'], hi: ['दूध', 'doodh', 'dudh'], ja: ['牛乳', 'ミルク'], th: ['นม'], id: ['susu'], vi: ['sua'] },
  },
  {
    id: 'soft_drink',
    category: 'drinks',
    icon: 'cup-soda',
    label: L('Soft drink', 'कोल्ड ड्रिंक', 'ソフトドリンク', 'น้ำอัดลม', 'Minuman ringan', 'Nước ngọt'),
    phrases: { en: ['soft drink', 'coke', 'cola', 'soda'], hi: ['कोल्ड ड्रिंक', 'cold drink', 'कोक'], ja: ['ソフトドリンク', 'コーラ', '炭酸'], th: ['น้ำอัดลม', 'โค้ก'], id: ['minuman ringan', 'soda', 'cola'], vi: ['nuoc ngot', 'coca'] },
  },
  {
    id: 'ice',
    category: 'drinks',
    icon: 'snowflake',
    label: L('Ice', 'बर्फ़', '氷', 'น้ำแข็ง', 'Es batu', 'Đá'),
    phrases: { en: ['ice', 'ice cubes'], hi: ['बर्फ़', 'बर्फ', 'barf'], ja: ['氷', 'こおり'], th: ['น้ำแข็ง'], id: ['es batu'], vi: ['nuoc da', 'da vien'] },
  },
  // ── Comfort ────────────────────────────────────────────────────────────
  {
    id: 'blanket',
    category: 'comfort',
    icon: 'bed',
    common: true,
    label: L('Blanket', 'कंबल', '毛布', 'ผ้าห่ม', 'Selimut', 'Chăn'),
    phrases: { en: ['blanket'], hi: ['कंबल', 'कम्बल', 'kambal'], ja: ['毛布', 'ブランケット'], th: ['ผ้าห่ม', 'ผ้าคลุม'], id: ['selimut'], vi: ['chan'] },
    hints: { en: ['warm', 'cold'], hi: ['गरम', 'गर्म', 'garam', 'ठंड'], ja: ['寒い'], th: ['หนาว'], id: ['dingin'], vi: ['lanh'] },
  },
  {
    id: 'pillow',
    category: 'comfort',
    icon: 'bed',
    label: L('Pillow', 'तकिया', '枕', 'หมอน', 'Bantal', 'Gối'),
    phrases: { en: ['pillow', 'cushion'], hi: ['तकिया', 'takiya'], ja: ['枕', 'まくら'], th: ['หมอน'], id: ['bantal'], vi: ['goi'] },
  },
  {
    id: 'too_cold',
    category: 'comfort',
    icon: 'snowflake',
    label: L('I feel cold', 'ठंड लग रही है', '寒い', 'หนาว', 'Kedinginan', 'Tôi thấy lạnh'),
    phrases: { en: ['too cold', 'feel cold', 'freezing'], hi: ['ठंड लग रही', 'thand'], ja: ['寒い', 'さむい'], th: ['หนาว'], id: ['kedinginan'], vi: ['thay lanh', 'lanh qua'] },
    hints: { en: ['cold'], hi: ['ठंड'], vi: ['lanh'], id: ['dingin'] },
  },
  {
    id: 'too_hot',
    category: 'comfort',
    icon: 'sun',
    label: L('I feel hot', 'गर्मी लग रही है', '暑い', 'ร้อน', 'Kepanasan', 'Tôi thấy nóng'),
    phrases: { en: ['too hot', 'feel hot', 'too warm'], hi: ['गर्मी', 'garmi'], ja: ['暑い', 'あつい'], th: ['ร้อนมาก'], id: ['kepanasan', 'gerah'], vi: ['thay nong', 'nong qua'] },
  },
  {
    id: 'headphones',
    category: 'comfort',
    icon: 'headphones',
    label: L('Headphones', 'हेडफ़ोन', 'ヘッドホン', 'หูฟัง', 'Headphone', 'Tai nghe'),
    phrases: { en: ['headphones', 'headphone', 'earphones'], hi: ['हेडफ़ोन', 'हेडफोन', 'headphone'], ja: ['ヘッドホン', 'イヤホン'], th: ['หูฟัง'], id: ['headphone', 'earphone'], vi: ['tai nghe'] },
  },
  {
    id: 'eye_mask',
    category: 'comfort',
    icon: 'eye-off',
    label: L('Eye mask', 'आँखों का मास्क', 'アイマスク', 'ผ้าปิดตา', 'Penutup mata', 'Bịt mắt'),
    phrases: { en: ['eye mask', 'sleep mask'], hi: ['आँखों का मास्क', 'आई मास्क', 'eye mask'], ja: ['アイマスク'], th: ['ผ้าปิดตา'], id: ['penutup mata'], vi: ['bit mat'] },
  },
  {
    id: 'tissues',
    category: 'comfort',
    icon: 'droplets',
    label: L('Tissues / wet towel', 'टिशू / गीला तौलिया', 'ティッシュ・おしぼり', 'ทิชชู / ผ้าเย็น', 'Tisu / handuk basah', 'Khăn giấy / khăn ướt'),
    phrases: { en: ['tissue', 'tissues', 'napkin', 'wet towel', 'wipes'], hi: ['टिशू', 'नैपकिन', 'tissue'], ja: ['ティッシュ', 'おしぼり', 'ナプキン'], th: ['ทิชชู', 'ผ้าเย็น'], id: ['tisu', 'handuk basah'], vi: ['khan giay', 'khan uot'] },
  },
  {
    id: 'seat_help',
    category: 'comfort',
    icon: 'armchair',
    label: L('Help with my seat', 'सीट में मदद', '座席の操作', 'ช่วยเรื่องที่นั่ง', 'Bantuan kursi', 'Giúp chỉnh ghế'),
    phrases: { en: ['recline', 'seat belt', 'seatbelt', 'adjust my seat'], hi: ['सीट बेल्ट', 'सीट पीछे'], ja: ['リクライニング', 'シートベルト', '座席の操作'], th: ['ปรับเบาะ', 'เข็มขัดนิรภัย'], id: ['sandaran kursi', 'sabuk pengaman'], vi: ['nga ghe', 'day an toan'] },
    hints: { en: ['seat'], hi: ['सीट'], ja: ['座席'], th: ['ที่นั่ง', 'เบาะ'], id: ['kursi'], vi: ['ghe'] },
  },
  {
    id: 'screen_help',
    category: 'comfort',
    icon: 'monitor-play',
    label: L('Help with the screen', 'स्क्रीन में मदद', '画面の操作', 'ช่วยเรื่องจอ', 'Bantuan layar', 'Giúp dùng màn hình'),
    phrases: { en: ['screen', 'movie', 'entertainment', 'tv'], hi: ['स्क्रीन', 'फ़िल्म', 'फिल्म', 'screen', 'movie'], ja: ['画面', 'モニター', '映画'], th: ['หน้าจอ', 'ดูหนัง'], id: ['layar', 'film'], vi: ['man hinh', 'phim'] },
  },
  {
    id: 'charger',
    category: 'comfort',
    icon: 'battery-charging',
    label: L('Phone charging', 'फ़ोन चार्ज करना', 'スマホの充電', 'ชาร์จโทรศัพท์', 'Mengisi daya HP', 'Sạc điện thoại'),
    phrases: { en: ['charge', 'charger', 'charging', 'usb', 'battery'], hi: ['चार्ज', 'चार्जर', 'charger', 'charge'], ja: ['充電', '充電器'], th: ['ชาร์จ', 'ที่ชาร์จ', 'ชาร์จแบต', 'แบตหมด', 'สายชาร์จ'], id: ['charger', 'mengisi daya', 'cas hp', 'baterai'], vi: ['sac pin', 'sac dien thoai', 'het pin'] },
  },
  // ── Food ───────────────────────────────────────────────────────────────
  {
    id: 'meal',
    category: 'food',
    icon: 'utensils',
    common: true,
    purposes: ['vegetarian', 'for_child'],
    label: L('Food', 'खाना', '食事', 'อาหาร', 'Makanan', 'Suất ăn'),
    phrases: { en: ['food', 'meal', 'hungry', 'eat'], hi: ['खाना', 'खाने', 'भूख', 'khana', 'bhookh'], ja: ['食事', 'ご飯', 'お腹が空'], th: ['อาหาร', 'หิวข้าว', 'กินข้าว', 'อาหารกลางวัน', 'อาหารเย็น'], id: ['makanan', 'makan', 'lapar'], vi: ['do an', 'suat an', 'doi'] },
  },
  {
    id: 'snack',
    category: 'food',
    icon: 'cookie',
    label: L('Snack', 'हल्का नाश्ता', '軽食', 'ของว่าง', 'Camilan', 'Đồ ăn nhẹ'),
    phrases: { en: ['snack', 'biscuit'], hi: ['नाश्ता', 'बिस्कुट', 'nashta'], ja: ['軽食', 'お菓子'], th: ['ของว่าง', 'ขนม'], id: ['camilan', 'snack'], vi: ['do an nhe', 'banh'] },
  },
  {
    id: 'veg_meal',
    category: 'food',
    icon: 'salad',
    label: L('Vegetarian meal', 'शाकाहारी खाना', 'ベジタリアン食', 'อาหารมังสวิรัติ', 'Makanan vegetarian', 'Suất ăn chay'),
    phrases: { en: ['vegetarian meal', 'veg meal', 'no meat', 'vegan'], hi: ['शाकाहारी खाना', 'वेज खाना', 'veg khana', 'shakahari khana'], ja: ['ベジタリアン食', '菜食', '肉なし'], th: ['อาหารมังสวิรัติ', 'อาหารเจ'], id: ['makanan vegetarian', 'tanpa daging'], vi: ['suat an chay', 'do an chay'] },
  },
  {
    id: 'baby_food',
    category: 'food',
    icon: 'baby',
    label: L('Baby food', 'बच्चे का खाना', '離乳食', 'อาหารเด็ก', 'Makanan bayi', 'Đồ ăn cho em bé'),
    phrases: { en: ['baby food', 'food for my baby'], hi: ['बच्चे का खाना', 'baby food'], ja: ['離乳食', 'ベビーフード'], th: ['อาหารเด็ก'], id: ['makanan bayi'], vi: ['do an cho em be', 'do an tre em'] },
  },
  {
    id: 'allergy',
    category: 'food',
    icon: 'shield-alert',
    label: L('Food allergy question', 'खाने से एलर्जी', '食物アレルギー', 'แพ้อาหาร', 'Alergi makanan', 'Dị ứng thức ăn'),
    phrases: { en: ['allergy', 'allergic', 'nuts', 'gluten'], hi: ['एलर्जी', 'allergy'], ja: ['アレルギー'], th: ['แพ้อาหาร'], id: ['alergi'], vi: ['di ung'] },
  },
  // ── Help ───────────────────────────────────────────────────────────────
  {
    id: 'toilet',
    category: 'help',
    icon: 'toilet',
    common: true,
    label: L('Toilet', 'टॉयलेट', 'トイレ', 'ห้องน้ำ', 'Toilet', 'Nhà vệ sinh'),
    phrases: { en: ['toilet', 'bathroom', 'restroom', 'washroom', 'lavatory'], hi: ['टॉयलेट', 'शौचालय', 'बाथरूम', 'toilet'], ja: ['トイレ', 'お手洗い'], th: ['ห้องน้ำ', 'สุขา', 'ห้องส้วม'], id: ['toilet', 'kamar kecil'], vi: ['nha ve sinh', 'di ve sinh', 'toilet'] },
  },
  {
    id: 'medicine',
    category: 'help',
    icon: 'pill',
    common: true,
    label: L('Medicine', 'दवाई', '薬', 'ยา', 'Obat', 'Thuốc'),
    phrases: { en: ['medicine', 'tablets', 'pills', 'painkiller'], hi: ['दवाई', 'दवा', 'dawai', 'dawa', 'goli', 'गोली'], ja: ['薬', 'くすり'], th: ['ขอยา', 'ยาแก้', 'ยาประจำตัว', 'ยาแก้ปวด', 'ยาลดไข้'], id: ['obat'], vi: ['thuoc'] },
  },
  {
    id: 'unwell',
    category: 'help',
    icon: 'thermometer',
    common: true,
    purposes: ['urgent'],
    label: L('I feel unwell', 'तबीयत ख़राब', '体調が悪い', 'ไม่สบาย', 'Tidak enak badan', 'Tôi thấy không khỏe'),
    phrases: { en: ['unwell', 'sick', 'not feeling well', 'dizzy', 'pain'], hi: ['तबीयत', 'चक्कर', 'दर्द', 'tabiyat', 'bimar', 'बीमार'], ja: ['体調', '気分が悪', 'めまい', '痛い'], th: ['ไม่สบาย', 'เวียนหัว', 'ปวด', 'ปวดหัว'], id: ['tidak enak badan', 'pusing', 'sakit'], vi: ['khong khoe', 'chong mat', 'dau'] },
  },
  {
    id: 'bag_help',
    category: 'help',
    icon: 'luggage',
    label: L('Help with my bag', 'सामान में मदद', '荷物の手伝い', 'ช่วยเรื่องกระเป๋า', 'Bantuan tas', 'Giúp hành lý'),
    phrases: { en: ['bag', 'luggage', 'suitcase', 'overhead'], hi: ['सामान', 'बैग', 'saman', 'bag'], ja: ['荷物', 'かばん'], th: ['กระเป๋า'], id: ['tas', 'koper'], vi: ['hanh ly', 'tui'] },
  },
  {
    id: 'call_crew',
    category: 'help',
    icon: 'bell-ring',
    label: L('Please come to my seat', 'कृपया मेरी सीट पर आएँ', '席に来てください', 'กรุณามาที่ที่นั่ง', 'Tolong datang ke kursi saya', 'Xin đến ghế của tôi'),
    phrases: { en: ['come here', 'call crew', 'call the crew', 'come to my seat'], hi: ['यहाँ आइए', 'क्रू को बुलाओ'], ja: ['来てください', '呼んで'], th: ['ช่วยด้วย'], id: ['tolong datang'], vi: ['den day'] },
    hints: { en: ['help'], hi: ['मदद', 'madad'], ja: ['助けて'], th: ['ช่วย'], id: ['tolong', 'bantu'], vi: ['giup'] },
  },
  {
    id: 'wheelchair_arrival',
    category: 'help',
    icon: 'accessibility',
    label: L('Wheelchair on arrival', 'पहुँचने पर व्हीलचेयर', '到着時に車いす', 'รถเข็นเมื่อถึงปลายทาง', 'Kursi roda saat tiba', 'Xe lăn khi đến nơi'),
    phrases: { en: ['wheelchair'], hi: ['व्हीलचेयर', 'व्हील चेयर', 'wheelchair'], ja: ['車いす', '車椅子'], th: ['รถเข็น', 'วีลแชร์'], id: ['kursi roda'], vi: ['xe lan'] },
  },
  {
    id: 'arrival_form',
    category: 'help',
    icon: 'file-text',
    label: L('Help with arrival forms', 'आगमन फ़ॉर्म में मदद', '入国書類の記入', 'ช่วยกรอกเอกสารขาเข้า', 'Bantuan formulir kedatangan', 'Giúp điền tờ khai nhập cảnh'),
    phrases: { en: ['form', 'arrival form', 'immigration', 'customs'], hi: ['फ़ॉर्म', 'फॉर्म', 'form', 'इमिग्रेशन'], ja: ['入国カード', '税関', '書類'], th: ['ใบตม', 'เอกสารขาเข้า', 'ศุลกากร'], id: ['formulir', 'imigrasi', 'bea cukai'], vi: ['to khai', 'nhap canh', 'hai quan'] },
  },
  {
    id: 'connection',
    category: 'help',
    icon: 'plane-takeoff',
    label: L('My connecting flight', 'मेरी कनेक्टिंग फ़्लाइट', '乗り継ぎ便', 'เที่ยวบินต่อเครื่อง', 'Penerbangan lanjutan', 'Chuyến bay nối chuyến'),
    phrases: { en: ['connecting flight', 'connection', 'transfer', 'next flight'], hi: ['कनेक्टिंग फ़्लाइट', 'अगली फ़्लाइट', 'connecting flight'], ja: ['乗り継ぎ', '乗継'], th: ['ต่อเครื่อง'], id: ['transit', 'penerbangan lanjutan'], vi: ['noi chuyen', 'chuyen bay tiep'] },
  },
  {
    id: 'time_left',
    category: 'help',
    icon: 'clock',
    label: L('How long until we land?', 'कितनी देर में उतरेंगे?', '到着までの時間', 'อีกนานแค่ไหนจะถึง', 'Berapa lama lagi mendarat?', 'Bao lâu nữa thì hạ cánh?'),
    phrases: { en: ['how long', 'when do we land', 'landing time', 'what time'], hi: ['कितनी देर', 'कब पहुँचेंगे', 'kitni der'], ja: ['あとどのくらい', '到着時刻', '何時に着'], th: ['อีกนานไหม', 'ถึงกี่โมง'], id: ['berapa lama', 'kapan mendarat'], vi: ['bao lau', 'khi nao ha canh'] },
  },
  {
    id: 'lost_item',
    category: 'help',
    icon: 'search',
    label: L('I lost something', 'मेरा कुछ खो गया है', '落とし物', 'ของหาย', 'Barang saya hilang', 'Tôi bị mất đồ'),
    phrases: { en: ['lost', 'dropped', 'cannot find', "can't find"], hi: ['खो गया', 'गिर गया', 'kho gaya'], ja: ['落とし物', 'なくした', '落とした'], th: ['ของหาย', 'ทำตก'], id: ['hilang', 'terjatuh'], vi: ['mat do', 'danh roi'] },
  },
  {
    id: 'diaper',
    category: 'help',
    icon: 'baby',
    label: L('Baby changing / diapers', 'बच्चे का डायपर', 'おむつ交換', 'เปลี่ยนผ้าอ้อม', 'Popok bayi', 'Thay tã cho bé'),
    phrases: { en: ['diaper', 'nappy', 'changing table'], hi: ['डायपर', 'diaper'], ja: ['おむつ', 'オムツ'], th: ['ผ้าอ้อม'], id: ['popok'], vi: ['thay ta', 'ta em be'] },
  },
  // ── Private ────────────────────────────────────────────────────────────
  {
    id: 'sanitary',
    category: 'private',
    icon: 'shopping-bag',
    private: true,
    label: L('Sanitary products', 'सैनिटरी पैड', '生理用品', 'ผ้าอนามัย', 'Pembalut', 'Băng vệ sinh'),
    phrases: { en: ['sanitary', 'pad', 'tampon', 'period'], hi: ['पैड', 'सैनिटरी', 'pad'], ja: ['生理用品', 'ナプキン'], th: ['ผ้าอนามัย'], id: ['pembalut'], vi: ['bang ve sinh'] },
  },
  {
    id: 'sick_bag',
    category: 'private',
    icon: 'shopping-bag',
    private: true,
    label: L('Sick bag', 'उल्टी की थैली', 'エチケット袋', 'ถุงอาเจียน', 'Kantong muntah', 'Túi nôn'),
    phrases: { en: ['sick bag', 'vomit', 'vomiting', 'throw up', 'nausea', 'nauseous'], hi: ['उल्टी', 'ulti'], ja: ['吐き気', 'エチケット袋'], th: ['อาเจียน', 'คลื่นไส้', 'อ้วก', 'ถุงอาเจียน'], id: ['muntah', 'mual'], vi: ['buon non', 'muon non'] },
  },
  {
    id: 'toilet_assist',
    category: 'private',
    icon: 'hand-helping',
    private: true,
    label: L('Help going to the toilet', 'टॉयलेट जाने में मदद', 'トイレへの介助', 'ช่วยพาไปห้องน้ำ', 'Bantuan ke toilet', 'Giúp đi vệ sinh'),
    phrases: { en: ['help to the toilet', 'help going to the toilet'], hi: ['टॉयलेट जाने में मदद'], ja: ['トイレの介助'], th: ['ช่วยพาไปห้องน้ำ'], id: ['bantuan ke toilet'], vi: ['giup di ve sinh'] },
  },
  {
    id: 'private_talk',
    category: 'private',
    icon: 'lock',
    private: true,
    label: L('Talk to crew privately', 'क्रू से निजी बात', '内密に相談したい', 'ขอคุยเป็นการส่วนตัว', 'Bicara pribadi dengan awak', 'Nói chuyện riêng với tiếp viên'),
    phrases: { en: ['privately', 'private'], hi: ['निजी', 'अकेले में'], ja: ['内密', '内緒'], th: ['ส่วนตัว'], id: ['pribadi'], vi: ['rieng tu'] },
  },
  {
    id: 'anxious',
    category: 'private',
    icon: 'heart',
    private: true,
    label: L('I feel anxious', 'मुझे घबराहट हो रही है', '不安を感じている', 'รู้สึกกังวล', 'Saya cemas', 'Tôi thấy lo lắng'),
    phrases: { en: ['anxious', 'scared', 'afraid', 'panic', 'nervous'], hi: ['घबराहट', 'डर लग', 'ghabrahat'], ja: ['不安', '怖い'], th: ['กังวล', 'กลัว'], id: ['cemas', 'takut', 'panik'], vi: ['lo lang', 'so hai', 'hoang so'] },
  },
  {
    id: 'bothered',
    category: 'private',
    icon: 'user-x',
    private: true,
    label: L('Someone is bothering me', 'कोई मुझे परेशान कर रहा है', '迷惑行為の相談', 'มีคนรบกวนฉัน', 'Ada yang mengganggu saya', 'Có người làm phiền tôi'),
    phrases: { en: ['bothering me', 'harass', 'harassment', 'touching me'], hi: ['परेशान कर रहा', 'छेड़', 'pareshan'], ja: ['迷惑', '嫌がらせ'], th: ['รบกวน', 'คุกคาม'], id: ['mengganggu', 'pelecehan'], vi: ['lam phien', 'quay roi'] },
  },
];

/** The 40 needs, every language pack's vocabulary merged in. */
export const NEEDS: Need[] = withPackVocabulary(CATALOGUE);

/** The catalogue without pack vocabulary, for tests and for measuring what a pack adds. */
export { CATALOGUE as CORE_NEEDS };

export const PURPOSES: NeedPurpose[] = [
  { id: 'for_medicine', label: L('to take medicine', 'दवाई के लिए', '服薬のため', 'เพื่อกินยา', 'untuk minum obat', 'để uống thuốc') },
  { id: 'vegetarian', label: L('vegetarian', 'शाकाहारी', 'ベジタリアン', 'มังสวิรัติ', 'vegetarian', 'ăn chay') },
  { id: 'for_child', label: L('for a child', 'बच्चे के लिए', '子ども用', 'สำหรับเด็ก', 'untuk anak', 'cho trẻ em') },
  { id: 'urgent', label: L('urgent', 'जल्दी', '至急', 'ด่วน', 'mendesak', 'khẩn cấp') },
];

/** Vocabulary that marks a purpose in speech/typed input (matched before needs, so it is not mistaken for a need). */
export const PURPOSE_PHRASES: Record<NeedPurpose['id'], string[]> = {
  for_medicine: [
    'for medicine', 'for my medicine', 'to take medicine', 'to take my medicine', 'for my tablets', 'for my pills', 'for tablets',
    'दवाई के लिए', 'दवा के लिए', 'दवाई लेने', 'dawai ke liye', 'dawa ke liye',
    '薬を飲む', '服薬', '薬のため',
    'เพื่อกินยา', 'กินยา',
    'minum obat', 'untuk obat',
    'uong thuoc',
    'ওষুধ খাওয়ার', 'ওষুধ খাব', 'ওষুধটা খাব', 'ওষুধ খেতে',
    'மாத்திரை சாப்பிட', 'மருந்து சாப்பிட', 'மாத்திரை போட', 'மருந்து போட',
    'ਦਵਾਈ ਖਾਣੀ', 'ਦਵਾਈ ਖਾਣ', 'ਦਵਾਈ ਲੈਣ', 'ਦਵਾਈ ਲੈਣੀ',
    'औषध घ्यायचे', 'औषध घेण्यासाठी', 'औषध घ्यायला', 'गोळी घेण्यासाठी', 'गोळी घ्यायची',
    'మందు వేసుకోవడానికి', 'మందు వేసుకోవాలి', 'మాత్రలు వేసుకోవడానికి', 'మాత్ర వేసుకోవడానికి',
    'ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳಲು', 'ಔಷಧಿ ತಗೊಳ್ಳೋಕೆ', 'ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳಲು', 'ಮಾತ್ರೆ ನುಂಗಲು',
    'മരുന്ന് കഴിക്കാൻ', 'ഗുളിക കഴിക്കാൻ',
    'દવા લેવા', 'દવા લેવાની', 'દવા ખાવા', 'ગોળી લેવા',
    'ଔଷଧ ଖାଇବା', 'ଔଷଧ ଖାଇବାକୁ', 'ଗୋଳି ଖାଇବା',
  ],
  vegetarian: ['vegetarian', 'veg', 'शाकाहारी', 'shakahari', 'ベジタリアン', 'มังสวิรัติ', 'ăn chay', 'an chay'],
  for_child: [
    'for my child', 'for a child', 'for my baby', 'बच्चे के लिए', 'bacche ke liye', '子ども', '赤ちゃん', 'สำหรับเด็ก', 'untuk anak', 'cho tre', 'cho be',
    'పిల్లల కోసం', 'పాప కోసం', 'బాబు కోసం', 'ಮಗುವಿಗಾಗಿ', 'ಮಗುವಿಗೋಸ್ಕರ', 'കുട്ടിക്ക് വേണ്ടി', 'കുഞ്ഞിന് വേണ്ടി', 'બાળક માટે', 'છોકરા માટે', 'ପିଲା ପାଇଁ', 'ଶିଶୁ ପାଇଁ',
  ],
  urgent: [
    'urgent', 'quickly', 'emergency', 'जल्दी', 'jaldi', '至急', '急いで', 'ด่วน', 'mendesak', 'darurat', 'khan cap',
    'త్వరగా', 'అర్జెంట్', 'ತುರ್ತು', 'ಅರ್ಜೆಂಟ್', 'വേഗം', 'അടിയന്തരം', 'જલદી', 'તાત્કાલિક', 'ଶୀଘ୍ର', 'ଜରୁରୀ',
  ],
};

export const CATEGORY_LABELS: Record<NeedCategory, ReturnType<typeof L>> = {
  drinks: L('Drinks', 'पेय', '飲み物', 'เครื่องดื่ม', 'Minuman', 'Đồ uống'),
  comfort: L('Comfort', 'आराम', '快適', 'ความสบาย', 'Kenyamanan', 'Tiện nghi'),
  food: L('Food', 'खाना', '食事', 'อาหาร', 'Makanan', 'Đồ ăn'),
  help: L('Help', 'मदद', 'サポート', 'ช่วยเหลือ', 'Bantuan', 'Trợ giúp'),
  private: L('Private', 'निजी', 'プライベート', 'ส่วนตัว', 'Pribadi', 'Riêng tư'),
};

export const CATEGORIES: NeedCategory[] = ['drinks', 'comfort', 'food', 'help', 'private'];

const byId = new Map(NEEDS.map((n) => [n.id, n]));

export function getNeed(id: string): Need | undefined {
  return byId.get(id);
}

export function requireNeed(id: string): Need {
  const need = byId.get(id);
  if (!need) throw new Error(`Unknown need: ${id}`);
  return need;
}

export function getPurpose(id: NeedPurpose['id'] | undefined): NeedPurpose | undefined {
  return id ? PURPOSES.find((p) => p.id === id) : undefined;
}

export const COMMON_NEEDS: Need[] = NEEDS.filter((n) => n.common);
export const PRIVATE_NEEDS: Need[] = NEEDS.filter((n) => n.private);

export function needsInCategory(category: NeedCategory): Need[] {
  return NEEDS.filter((n) => n.category === category);
}
