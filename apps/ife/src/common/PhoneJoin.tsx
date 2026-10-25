import { type LangCode } from '@hearme/shared';
import { hubBaseUrl } from './hub';

const COPY: Partial<Record<LangCode, [string, string]>> = {
  en: ['Use your phone', 'Scan to open HearMe in your browser. No app to install. Connect to the cabin Wi-Fi first.'],
  ja: ['スマートフォンで利用', '機内Wi-Fiに接続してスキャン。ブラウザで利用でき、アプリのインストールは不要です。'],
  hi: ['अपने फ़ोन पर इस्तेमाल करें', 'पहले केबिन वाई-फ़ाई से जुड़ें, फिर स्कैन करें। HearMe ब्राउज़र में खुलेगा। ऐप इंस्टॉल करने की ज़रूरत नहीं।'],
  th: ['ใช้บนโทรศัพท์ของคุณ', 'เชื่อมต่อ Wi-Fi ในห้องโดยสารแล้วสแกนเพื่อเปิด HearMe ในเบราว์เซอร์ ไม่ต้องติดตั้งแอป'],
  id: ['Gunakan ponsel Anda', 'Hubungkan ke Wi-Fi kabin, lalu pindai untuk membuka HearMe di browser. Tidak perlu menginstal aplikasi.'],
  vi: ['Dùng điện thoại của bạn', 'Kết nối Wi-Fi trên máy bay rồi quét để mở HearMe trong trình duyệt. Không cần cài ứng dụng.'],
};

/** Every IFE QR opens the browser app for this seat, never a setup/download page. */
export function passengerUrl(join: string | undefined, seat: string): string | null {
  if (!join) return null;
  try {
    const url = new URL(join);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.pathname = '/mobile/';
    url.search = '';
    url.hash = '';
    url.searchParams.set('seat', seat);
    return url.href;
  } catch { return null; }
}

export function PhoneJoin({ url, seat, lang = 'en' }: { url: string | null; seat: string; lang?: LangCode }) {
  if (!url) return null;
  const contentLang = COPY[lang] ? lang : 'en';
  const [title, detail] = COPY[contentLang]!;
  return (
    <aside className="ife-phone-join" lang={contentLang} aria-label={title}>
      <img src={`${hubBaseUrl()}/api/qr.svg?size=240&data=${encodeURIComponent(url)}`} width={160} height={160} alt={`HearMe · ${seat}`} />
      <div><h2>{title}</h2><p>{detail}</p><span className="ife-phone-join__seat">{seat}</span></div>
    </aside>
  );
}
