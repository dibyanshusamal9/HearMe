import type { BodyArea, ConditionId, LangCode, Localized, MedicalReport, SymptomId } from '../types';
import { localized } from '../i18n/resolve';
import { L } from './needs';

/**
 * Care Mode: a passenger who feels unwell taps where it hurts, how much, and
 * any symptoms or conditions. The crew get a structured summary in Japanese
 * and English they can read out to a doctor on board or ground medical
 * support. Prototype drafts: medical wording needs clinical and native review.
 */

export const BODY_AREAS: { id: BodyArea; label: Localized }[] = [
  { id: 'head', label: L('Head', 'सिर', '頭', 'ศีรษะ', 'Kepala', 'Đầu') },
  { id: 'eyes_ears', label: L('Eyes / ears', 'आँख / कान', '目・耳', 'ตา / หู', 'Mata / telinga', 'Mắt / tai') },
  { id: 'throat', label: L('Throat', 'गला', 'のど', 'คอ', 'Tenggorokan', 'Họng') },
  { id: 'chest', label: L('Chest', 'छाती', '胸', 'หน้าอก', 'Dada', 'Ngực') },
  { id: 'stomach', label: L('Stomach', 'पेट', 'お腹', 'ท้อง', 'Perut', 'Bụng') },
  { id: 'back', label: L('Back', 'पीठ', '背中', 'หลัง', 'Punggung', 'Lưng') },
  { id: 'arms', label: L('Arm / hand', 'बाँह / हाथ', '腕・手', 'แขน / มือ', 'Lengan / tangan', 'Tay') },
  { id: 'legs', label: L('Leg / foot', 'पैर', '脚・足', 'ขา / เท้า', 'Kaki', 'Chân') },
];

export const SYMPTOMS: { id: SymptomId; label: Localized; urgent: boolean }[] = [
  { id: 'breathing', urgent: true, label: L('Hard to breathe', 'साँस लेने में तकलीफ़', '息苦しい', 'หายใจลำบาก', 'Sesak napas', 'Khó thở') },
  { id: 'faint', urgent: true, label: L('About to faint', 'बेहोशी जैसा लग रहा है', '気を失いそう', 'จะเป็นลม', 'Mau pingsan', 'Sắp ngất') },
  { id: 'bleeding', urgent: true, label: L('Bleeding', 'खून बह रहा है', '出血', 'เลือดออก', 'Berdarah', 'Chảy máu') },
  { id: 'numb', urgent: true, label: L('Numb or weak', 'सुन्नपन / कमज़ोरी', 'しびれ・脱力', 'ชา / อ่อนแรง', 'Mati rasa / lemas', 'Tê / yếu') },
  { id: 'dizzy', urgent: false, label: L('Dizzy', 'चक्कर आ रहे हैं', 'めまい', 'เวียนหัว', 'Pusing', 'Chóng mặt') },
  { id: 'nausea', urgent: false, label: L('Feel sick', 'जी मिचला रहा है', '吐き気', 'คลื่นไส้', 'Mual', 'Buồn nôn') },
  { id: 'fever', urgent: false, label: L('Fever / chills', 'बुखार', '発熱・寒気', 'มีไข้', 'Demam', 'Sốt') },
  { id: 'allergy', urgent: true, label: L('Allergic reaction', 'एलर्जी', 'アレルギー反応', 'แพ้', 'Reaksi alergi', 'Dị ứng') },
];

export const CONDITIONS: { id: ConditionId; label: Localized }[] = [
  { id: 'diabetes', label: L('Diabetes', 'मधुमेह (डायबिटीज़)', '糖尿病', 'เบาหวาน', 'Diabetes', 'Tiểu đường') },
  { id: 'heart', label: L('Heart condition', 'दिल की बीमारी', '心臓病', 'โรคหัวใจ', 'Penyakit jantung', 'Bệnh tim') },
  { id: 'asthma', label: L('Asthma', 'दमा (अस्थमा)', '喘息', 'หอบหืด', 'Asma', 'Hen suyễn') },
  { id: 'blood_pressure', label: L('High blood pressure', 'हाई ब्लड प्रेशर', '高血圧', 'ความดันโลหิตสูง', 'Darah tinggi', 'Huyết áp cao') },
  { id: 'pregnant', label: L('Pregnant', 'गर्भवती', '妊娠中', 'ตั้งครรภ์', 'Hamil', 'Đang mang thai') },
  { id: 'epilepsy', label: L('Epilepsy', 'मिर्गी', 'てんかん', 'โรคลมชัก', 'Epilepsi', 'Động kinh') },
];

/**
 * Care Mode wording stays in the six core languages on purpose. A language
 * pack may not supply it: this is the text a crew member acts on medically, so
 * it needs clinical review in each language before it is shown, and until then
 * a pack language shows it in the core language it falls back to.
 */

/** Words for the 0–10 pain scale (shown under the number). */
export const PAIN_WORDS: { upTo: number; label: Localized }[] = [
  { upTo: 0, label: L('No pain', 'दर्द नहीं', '痛みなし', 'ไม่ปวด', 'Tidak sakit', 'Không đau') },
  { upTo: 3, label: L('Mild', 'हल्का', '軽い', 'ปวดเล็กน้อย', 'Ringan', 'Nhẹ') },
  { upTo: 6, label: L('Moderate', 'मध्यम', '中くらい', 'ปวดปานกลาง', 'Sedang', 'Vừa') },
  { upTo: 8, label: L('Severe', 'तेज़', '強い', 'ปวดมาก', 'Berat', 'Nặng') },
  { upTo: 10, label: L('Worst possible', 'बहुत तेज़', '耐えられない', 'ปวดที่สุด', 'Sangat berat', 'Rất nặng') },
];

export function painWord(pain: number, lang: LangCode): string {
  return localized((PAIN_WORDS.find((p) => pain <= p.upTo) ?? PAIN_WORDS[PAIN_WORDS.length - 1]!).label, lang);
}

export function emptyMedicalReport(): MedicalReport {
  return { areas: [], pain: null, symptoms: [], conditions: [] };
}

/** Severe pain, or a red-flag symptom: the crew console shows it first, in red. */
export function isUrgentMedical(r: MedicalReport | undefined): boolean {
  if (!r) return false;
  const pain = r.pain ?? 0;
  if (pain >= 7) return true;
  if (r.areas.includes('chest') && pain >= 4) return true;
  return r.symptoms.some((s) => SYMPTOMS.find((x) => x.id === s)?.urgent);
}

const label = <T extends string>(list: { id: T; label: Localized }[], id: T, lang: LangCode) => {
  const found = list.find((x) => x.id === id);
  return found ? localized(found.label, lang) : id;
};

/** One line per fact, e.g. ["Pain 7/10 (Severe): Chest", "Dizzy · Feel sick", "Known: Diabetes"]; "Chest · pain not rated" without a number. */
export function medicalSummaryLines(r: MedicalReport, lang: LangCode): string[] {
  const where = r.areas.map((a) => label(BODY_AREAS, a, lang)).join(lang === 'ja' ? '・' : ', ');
  const painLabel = localized(L('Pain', 'दर्द', '痛み', 'ความปวด', 'Nyeri', 'Đau'), lang);
  const knownLabel = localized(L('Known', 'पहले से', '持病', 'โรคประจำตัว', 'Riwayat', 'Bệnh nền'), lang);
  const notRated = localized(L('pain not rated', 'दर्द का स्तर नहीं बताया', '痛みの程度は未入力', 'ไม่ได้ระบุระดับความปวด', 'tingkat nyeri tidak diisi', 'chưa chọn mức đau'), lang);
  const lines =
    r.pain === null
      ? [`${where ? `${where} · ` : ''}${notRated}`]
      : [`${painLabel} ${r.pain}/10 (${painWord(r.pain, lang)})${where ? `: ${where}` : ''}`];
  if (r.symptoms.length) lines.push(r.symptoms.map((s) => label(SYMPTOMS, s, lang)).join(' · '));
  if (r.conditions.length) lines.push(`${knownLabel}: ${r.conditions.map((c) => label(CONDITIONS, c, lang)).join(', ')}`);
  return lines;
}

/**
 * Front-view body outline for the Care Mode picker, shared by the web and
 * native apps (each draws it with its own SVG library). "Back" is a separate
 * button because it is not visible from the front.
 */
export type BodyShape = { area: BodyArea } & (
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number }
);

export const BODY_MAP_VIEWBOX = { width: 200, height: 360 };

export const BODY_SHAPES: BodyShape[] = [
  { area: 'head', kind: 'circle', cx: 100, cy: 38, r: 26 },
  { area: 'eyes_ears', kind: 'circle', cx: 69, cy: 40, r: 9 },
  { area: 'eyes_ears', kind: 'circle', cx: 131, cy: 40, r: 9 },
  { area: 'throat', kind: 'rect', x: 88, y: 64, w: 24, h: 16, rx: 6 },
  { area: 'chest', kind: 'rect', x: 62, y: 80, w: 76, h: 62, rx: 18 },
  { area: 'stomach', kind: 'rect', x: 66, y: 142, w: 68, h: 58, rx: 14 },
  { area: 'arms', kind: 'rect', x: 34, y: 86, w: 24, h: 128, rx: 12 },
  { area: 'arms', kind: 'rect', x: 142, y: 86, w: 24, h: 128, rx: 12 },
  { area: 'legs', kind: 'rect', x: 68, y: 202, w: 30, h: 150, rx: 14 },
  { area: 'legs', kind: 'rect', x: 102, y: 202, w: 30, h: 150, rx: 14 },
];
