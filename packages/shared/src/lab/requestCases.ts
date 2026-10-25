/**
 * Sentences with several requests, refusals ("खाना मत भेजिए", "no ice"), and
 * look-alikes that must *not* be read as refusals ("there is no water in the
 * toilet" is a complaint; "no meat" is a vegetarian meal). Checked with the
 * keyword matcher by `npm test` and with the hub's full matcher by
 * `npm run multi -w @hearme/hub`.
 *
 * `want`: the needs to send (order does not matter); `refused`: exactly the
 * needs ruled out (default none). Written by the HearMe team, not by native
 * speakers of every language: a regression check, not an accuracy claim.
 */
export interface RequestCase {
  lang: string;
  text: string;
  want: string[];
  refused?: string[];
  purpose?: [needId: string, purposeId: string];
}

export const REQUEST_CASES: RequestCase[] = [
  // Hindi, as passengers type it: quotes, Devanagari and Latin letters mixed.
  {
    lang: 'hi',
    text: '“मुझे ठंडा पानी नहीं चाहिए, दवाई लेने के लिए थोड़ा गरम पानी और एक कंबल चाहिए, लेकिन खाना मत भेजिए।”',
    want: ['blanket', 'hot_water'],
    refused: ['meal', 'water'],
    purpose: ['hot_water', 'for_medicine'],
  },
  {
    lang: 'hi',
    text: 'मुझे ठंडा पानी नहीं चाहिए, दवाई लेने के लिए गरम पानी चाहिए, और हो सके तो एक कंबल भी दे दीजिए।',
    want: ['blanket', 'hot_water'],
    refused: ['water'],
    purpose: ['hot_water', 'for_medicine'],
  },
  { lang: 'hi', text: 'मुझे खाना मत भेजिए', want: [], refused: ['meal'] },
  { lang: 'hi', text: 'एक कंबल चाहिए लेकिन खाना nahi भेजिए', want: ['blanket'], refused: ['meal'] },
  { lang: 'hi', text: 'चाय नहीं, कॉफ़ी चाहिए', want: ['coffee'], refused: ['tea'] },
  { lang: 'hi', text: 'मुझे अभी भूख नहीं है, बस एक तकिया दे दीजिए', want: ['pillow'], refused: ['meal'] },
  { lang: 'hi', text: 'कंबल की ज़रूरत नहीं, बस गरम पानी', want: ['hot_water'], refused: ['blanket'] },
  { lang: 'hi', text: 'खाना रहने दीजिए, एक जूस दे दीजिए', want: ['juice'], refused: ['meal'] },
  { lang: 'hi', text: 'बिना बर्फ़ के पानी चाहिए', want: ['water'], refused: ['ice'] },
  { lang: 'hi', text: 'चाय की जगह कॉफ़ी मिल सकती है?', want: ['coffee'], refused: ['tea'] },
  { lang: 'hi', text: 'मेरी तबीयत ठीक नहीं है', want: ['unwell'] },
  { lang: 'hi', text: 'टॉयलेट में पानी नहीं है', want: ['toilet', 'water'] },
  { lang: 'hi', text: 'मुझे शाकाहारी खाना चाहिए', want: ['veg_meal'] },
  { lang: 'hi', text: 'mujhe thanda pani nahi chahiye, garam pani aur ek kambal chahiye', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'hi', text: 'khana mat bhejo, sirf chai', want: ['tea'], refused: ['meal'] },
  { lang: 'hi', text: 'chai nahi, coffee chahiye', want: ['coffee'], refused: ['tea'] },

  // English
  { lang: 'en', text: "I don't want cold water. I need hot water for my medicine and a blanket, please", want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'en', text: 'A blanket please, but no food for me', want: ['blanket'], refused: ['meal'] },
  { lang: 'en', text: "Tea and a pillow, but don't bring any food", want: ['pillow', 'tea'], refused: ['meal'] },
  { lang: 'en', text: 'No ice please, just water', want: ['water'], refused: ['ice'] },
  { lang: 'en', text: 'Coffee without milk', want: ['coffee'], refused: ['milk'] },
  { lang: 'en', text: "I'm not hungry, but could I have some juice?", want: ['juice'], refused: ['meal'] },
  { lang: 'en', text: 'hot water instead of tea', want: ['hot_water'], refused: ['tea'] },
  { lang: 'en', text: 'Please cancel the coffee and bring me tea', want: ['tea'], refused: ['coffee'] },
  { lang: 'en', text: 'No more water, thanks. Can I get a pillow?', want: ['pillow'], refused: ['water'] },
  { lang: 'en', text: 'I would like a vegetarian meal, no meat please', want: ['veg_meal'] },
  { lang: 'en', text: "I'm not feeling well and I need some water", want: ['unwell', 'water'] },
  { lang: 'en', text: 'My screen is not working', want: ['screen_help'] },
  { lang: 'en', text: "I can't sleep without a pillow", want: ['pillow'] },
  { lang: 'en', text: 'There is no water in the toilet', want: ['toilet', 'water'] },

  // Japanese
  { lang: 'ja', text: '冷たい水はいらない。お湯と毛布をください', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'ja', text: '食事はいりません。お茶をください', want: ['tea'], refused: ['meal'] },
  { lang: 'ja', text: 'ご飯は大丈夫です、毛布をお願いします', want: ['blanket'], refused: ['meal'] },
  { lang: 'ja', text: 'コーヒーをミルクなしでください', want: ['coffee'], refused: ['milk'] },
  { lang: 'ja', text: 'お茶じゃなくてコーヒーをください', want: ['coffee'], refused: ['tea'] },
  { lang: 'ja', text: '食事を持ってこないでください', want: [], refused: ['meal'] },
  { lang: 'ja', text: '肉なしの食事をお願いします', want: ['veg_meal'] },
  { lang: 'ja', text: '気分が悪いです', want: ['unwell'] },

  // Thai
  { lang: 'th', text: 'ไม่เอาน้ำเปล่า ขอน้ำร้อน และผ้าห่มหน่อย', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'th', text: 'ไม่รับอาหารครับ ขอชาร้อนหน่อย', want: ['tea'], refused: ['meal'] },
  { lang: 'th', text: 'ขอกาแฟไม่ใส่นม', want: ['coffee'], refused: ['milk'] },
  { lang: 'th', text: 'อย่าเอาอาหารมานะครับ', want: [], refused: ['meal'] },
  { lang: 'th', text: 'ไม่ใช่น้ำชา ขอกาแฟ', want: ['coffee'], refused: ['tea'] },
  { lang: 'th', text: 'ไม่สบาย ขอยาหน่อย', want: ['medicine', 'unwell'] },
  { lang: 'th', text: 'ไม่มีน้ำในห้องน้ำ', want: ['toilet'] },

  // Indonesian
  { lang: 'id', text: 'Saya tidak mau air putih, minta air panas dan selimut', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'id', text: 'Jangan kirim makanan, saya mau teh saja', want: ['tea'], refused: ['meal'] },
  { lang: 'id', text: 'Kopi tanpa susu, dan bantal', want: ['coffee', 'pillow'], refused: ['milk'] },
  { lang: 'id', text: 'Bukan teh, tapi kopi', want: ['coffee'], refused: ['tea'] },
  { lang: 'id', text: 'Saya tidak lapar, minta selimut saja', want: ['blanket'], refused: ['meal'] },
  { lang: 'id', text: 'Tidak ada selimut di kursi saya', want: ['blanket'] },
  { lang: 'id', text: 'Saya tidak enak badan', want: ['unwell'] },

  // Vietnamese, with and without accents
  { lang: 'vi', text: 'Tôi không cần nước lọc, cho tôi nước nóng và chăn', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'vi', text: 'Đừng mang đồ ăn, cho tôi trà', want: ['tea'], refused: ['meal'] },
  { lang: 'vi', text: 'khong can do an, cho toi tra', want: ['tea'], refused: ['meal'] },
  { lang: 'vi', text: 'Cà phê, không lấy nước đá', want: ['coffee'], refused: ['ice'] },
  { lang: 'vi', text: 'Không phải trà, cà phê', want: ['coffee'], refused: ['tea'] },
  { lang: 'vi', text: 'Tôi không đói, chỉ cần chăn', want: ['blanket'], refused: ['meal'] },
  { lang: 'vi', text: 'Tôi không khỏe, cho tôi thuốc', want: ['medicine', 'unwell'] },
  { lang: 'vi', text: 'Không có nước trong nhà vệ sinh', want: ['toilet'] },

  // Bengali
  { lang: 'bn', text: 'আমার ঠান্ডা জল চাই না, গরম জল আর একটা কম্বল দিন', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'bn', text: 'খাবার পাঠাবেন না, শুধু চা দিন', want: ['tea'], refused: ['meal'] },
  { lang: 'bn', text: 'আমার খাবার লাগবে না', want: [], refused: ['meal'] },
  { lang: 'bn', text: 'চা নয়, কফি দিন', want: ['coffee'], refused: ['tea'] },
  { lang: 'bn', text: 'আমার শরীর ভালো লাগছে না', want: ['unwell'] },

  // Tamil
  { lang: 'ta', text: 'குளிர்ந்த தண்ணீர் வேண்டாம், சுடுநீர் மற்றும் போர்வை வேண்டும்', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'ta', text: 'சாப்பாடு வேண்டாம், டீ கொடுங்கள்', want: ['tea'], refused: ['meal'] },
  { lang: 'ta', text: 'உணவு கொண்டு வராதீர்கள்', want: [], refused: ['meal'] },
  { lang: 'ta', text: 'இறைச்சி வேண்டாம், சைவ உணவு வேண்டும்', want: ['veg_meal'] },
  { lang: 'ta', text: 'எனக்கு உடல்நிலை சரியில்லை', want: ['unwell'] },

  // Punjabi
  { lang: 'pa', text: 'ਮੈਨੂੰ ਠੰਢਾ ਪਾਣੀ ਨਹੀਂ ਚਾਹੀਦਾ, ਗਰਮ ਪਾਣੀ ਅਤੇ ਕੰਬਲ ਚਾਹੀਦਾ ਹੈ', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'pa', text: 'ਖਾਣਾ ਨਾ ਭੇਜੋ, ਸਿਰਫ਼ ਚਾਹ', want: ['tea'], refused: ['meal'] },
  { lang: 'pa', text: 'ਚਾਹ ਨਹੀਂ, ਕੌਫ਼ੀ ਦਿਓ', want: ['coffee'], refused: ['tea'] },
  { lang: 'pa', text: 'ਮੇਰੀ ਤਬੀਅਤ ਠੀਕ ਨਹੀਂ', want: ['unwell'] },
  { lang: 'pa', text: 'ਟੀਵੀ ਨਹੀਂ ਚੱਲ ਰਿਹਾ', want: ['screen_help'] },

  // Marathi
  { lang: 'mr', text: 'मला थंड पाणी नको, गरम पाणी आणि ब्लँकेट हवे आहे', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'mr', text: 'जेवण पाठवू नका, फक्त चहा द्या', want: ['tea'], refused: ['meal'] },
  { lang: 'mr', text: 'चहा नको, कॉफी हवी', want: ['coffee'], refused: ['tea'] },
  { lang: 'mr', text: 'मला बरे वाटत नाही', want: ['unwell'] },

  // Telugu
  { lang: 'te', text: 'నాకు చల్లని నీళ్ళు వద్దు, వేడి నీళ్ళు మరియు ఒక దుప్పటి కావాలి', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'te', text: 'భోజనం పంపకండి, టీ మాత్రమే ఇవ్వండి', want: ['tea'], refused: ['meal'] },
  { lang: 'te', text: 'టీ వద్దు, కాఫీ కావాలి', want: ['coffee'], refused: ['tea'] },
  { lang: 'te', text: 'ఐస్ లేకుండా నీళ్ళు ఇవ్వండి', want: ['water'], refused: ['ice'] },
  { lang: 'te', text: 'నాకు ఒంట్లో బాగాలేదు', want: ['unwell'] },
  { lang: 'te', text: 'టీవీ పనిచేయడం లేదు', want: ['screen_help'] },

  // Kannada
  { lang: 'kn', text: 'ನನಗೆ ತಣ್ಣನೆಯ ನೀರು ಬೇಡ, ಬಿಸಿ ನೀರು ಮತ್ತು ಒಂದು ಹೊದಿಕೆ ಬೇಕು', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'kn', text: 'ಊಟ ಕಳುಹಿಸಬೇಡಿ, ಟೀ ಮಾತ್ರ ಕೊಡಿ', want: ['tea'], refused: ['meal'] },
  { lang: 'kn', text: 'ಟೀ ಬೇಡ, ಕಾಫಿ ಬೇಕು', want: ['coffee'], refused: ['tea'] },
  { lang: 'kn', text: 'ಐಸ್ ಇಲ್ಲದೆ ನೀರು ಕೊಡಿ', want: ['water'], refused: ['ice'] },
  { lang: 'kn', text: 'ನನಗೆ ಮೈ ಹುಷಾರಿಲ್ಲ', want: ['unwell'] },

  // Malayalam
  { lang: 'ml', text: 'എനിക്ക് തണുത്ത വെള്ളം വേണ്ട, ചൂടുവെള്ളം വേണം, പിന്നെ ഒരു പുതപ്പ് തരൂ', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'ml', text: 'ഭക്ഷണം കൊണ്ടുവരരുത്, ചായ മാത്രം മതി', want: ['tea'], refused: ['meal'] },
  { lang: 'ml', text: 'ചായ വേണ്ട, കാപ്പി വേണം', want: ['coffee'], refused: ['tea'] },
  { lang: 'ml', text: 'ഐസ് ഇല്ലാതെ വെള്ളം തരൂ', want: ['water'], refused: ['ice'] },
  { lang: 'ml', text: 'കുഞ്ഞിന് വേണ്ടി പാൽ തരാമോ', want: ['milk'], purpose: ['milk', 'for_child'] },
  { lang: 'ml', text: 'എനിക്ക് സുഖമില്ല', want: ['unwell'] },

  // Gujarati
  { lang: 'gu', text: 'મારે ઠંડું પાણી નથી જોઈતું, ગરમ પાણી અને એક ધાબળો જોઈએ છે', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'gu', text: 'જમવાનું ના મોકલશો, ફક્ત ચા આપો', want: ['tea'], refused: ['meal'] },
  { lang: 'gu', text: 'ચા નથી જોઈતી, કોફી જોઈએ', want: ['coffee'], refused: ['tea'] },
  { lang: 'gu', text: 'બરફ વગરનું પાણી આપો', want: ['water'], refused: ['ice'] },
  { lang: 'gu', text: 'મારી તબિયત સારી નથી', want: ['unwell'] },
  { lang: 'gu', text: 'ટીવી ચાલતું નથી', want: ['screen_help'] },

  // Odia, typed, and spoken (Whisper writes it as Hindi, moved into Odia letters)
  { lang: 'or', text: 'ମୋତେ ଥଣ୍ଡା ପାଣି ଦରକାର ନାହିଁ, ଗରମ ପାଣି ଏବଂ ଗୋଟିଏ କମ୍ବଳ ଦିଅନ୍ତୁ', want: ['blanket', 'hot_water'], refused: ['water'] },
  { lang: 'or', text: 'ଖାଦ୍ୟ ପଠାନ୍ତୁ ନାହିଁ, କେବଳ ଚା ଦିଅନ୍ତୁ', want: ['tea'], refused: ['meal'] },
  { lang: 'or', text: 'ଚା ଦରକାର ନାହିଁ, କଫି ଦିଅନ୍ତୁ', want: ['coffee'], refused: ['tea'] },
  { lang: 'or', text: 'ବରଫ ବିନା ପାଣି ଦିଅନ୍ତୁ', want: ['water'], refused: ['ice'] },
  { lang: 'or', text: 'ମୋର ଦେହ ଭଲ ନାହିଁ', want: ['unwell'] },
  { lang: 'or', text: 'ମୋତେ ପାଣି ଚାହିଁ', want: ['water'] },
  { lang: 'or', text: 'ପାନୀ ନହୀଂ ଚାହିଏ', refused: ['water'], want: [] },
];
