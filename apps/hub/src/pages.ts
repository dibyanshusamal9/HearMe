import { COMMON_NEEDS } from '@hearme/shared';
import QRCode from 'qrcode';

/**
 * Two printable pages served by the hub:
 *  - /seats: one card per seat for the seat pocket — a QR code that opens the
 *    passenger web app with the seat filled in, plus the numbered picture card
 *    passengers can point at when they have no phone.
 *  - /join: a big QR for the demo (judges scan it with their own phone).
 */

const EMOJI: Record<string, string> = {
  water: '💧',
  hot_water: '♨️',
  tea: '🍵',
  blanket: '🛏️',
  toilet: '🚻',
  medicine: '💊',
  unwell: '🤒',
  meal: '🍽️',
};

export function qrSvg(data: string, size = 200): Promise<string> {
  return QRCode.toString(data, { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M', color: { dark: '#13233A', light: '#FFFFFF' } });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BASE_CSS = `
  *{box-sizing:border-box}
  body{margin:0;font-family:"Avenir Next","Noto Sans","Noto Sans Devanagari","Hiragino Sans",system-ui,sans-serif;color:#13233A;background:#F4F6FA}
  .brand{font-weight:800;letter-spacing:-.02em}.brand span{color:#EF5B3B}
`;

export async function seatCardsPage(baseUrl: string, seats: string[]): Promise<string> {
  const picks = COMMON_NEEDS.filter((n) => EMOJI[n.id]).slice(0, 8);
  const cards = await Promise.all(
    seats.map(async (seat) => {
      const url = `${baseUrl}/mobile/?seat=${seat}`;
      const tiles = picks
        .map((n, i) => `<div class="tile"><b>${i + 1}</b><span class="e">${EMOJI[n.id]}</span><span class="ja">${esc(n.label.ja)}</span><span class="en">${esc(n.label.en)}</span></div>`)
        .join('');
      return `<section class="card">
        <header><div class="brand">Hear<span>Me</span></div><div class="seat">${seat}</div></header>
        <div class="row"><div class="qr">${await qrSvg(url, 150)}</div>
        <p class="how">Scan with your phone camera.<br>No app needed.<br><span>कैमरे से स्कैन करें · カメラで読み取り · สแกนด้วยกล้อง · Pindai dengan kamera · Quét bằng camera</span></p></div>
        <p class="point">No phone? Point at a picture. · 指さしてください</p>
        <div class="tiles">${tiles}</div>
      </section>`;
    }),
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>HearMe seat cards</title><style>${BASE_CSS}
  body{padding:16px}
  .bar{max-width:1100px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
  .bar button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:10px 18px;background:#13233A;color:#fff;cursor:pointer}
  .grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}
  .card{background:#fff;border:2px solid #13233A;border-radius:18px;padding:14px 16px;break-inside:avoid}
  .card header{display:flex;justify-content:space-between;align-items:center}
  .card .brand{font-size:20px}.seat{font-size:28px;font-weight:800}
  .row{display:flex;gap:12px;align-items:center;margin-top:6px}.qr svg{display:block;width:120px;height:120px}
  .how{margin:0;font-weight:700;font-size:15px;line-height:1.35}.how span{display:block;margin-top:6px;font-weight:500;font-size:11px;color:#46546B}
  .point{margin:10px 0 6px;font-size:12px;font-weight:700;color:#C8432A}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
  .tile{border:1.5px solid #D6DCE5;border-radius:10px;padding:5px 4px;text-align:center;position:relative}
  .tile b{position:absolute;left:5px;top:3px;font-size:10px;color:#7C8699}.tile .e{display:block;font-size:24px;line-height:1.2}
  .tile .ja{display:block;font-size:11px;font-weight:700}.tile .en{display:block;font-size:9.5px;color:#46546B}
  @media print{body{background:#fff;padding:0}.bar{display:none}.grid{gap:8px}}
  </style></head><body>
  <div class="bar"><div><span class="brand" style="font-size:22px">Hear<span>Me</span></span> · seat-pocket cards (${seats.length} seats)</div><button onclick="print()">Print</button></div>
  <div class="grid">${cards.join('')}</div></body></html>`;
}

export async function joinPage(phoneUrl: string, crewUrl: string, stageUrl: string): Promise<string> {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Join HearMe</title><style>${BASE_CSS}
  body{min-height:100vh;display:grid;place-items:center;padding:24px}
  main{background:#fff;border-radius:24px;padding:28px 32px;max-width:720px;box-shadow:0 20px 50px rgba(19,35,58,.12);display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center}
  h1{margin:0 0 6px;font-size:30px;letter-spacing:-.02em}p{margin:0 0 10px;color:#46546B;line-height:1.45}
  .qr svg{display:block;width:260px;height:260px}code{font-size:13px;background:#F4F6FA;padding:2px 6px;border-radius:6px;word-break:break-all}
  .note{font-size:13px;background:#FFF3D6;color:#6B4A00;padding:10px 12px;border-radius:12px}
  a{color:#1F6FEB;font-weight:700}
  @media (max-width:640px){main{grid-template-columns:1fr}}
  </style></head><body><main>
  <div class="qr">${await qrSvg(phoneUrl, 260)}</div>
  <div><div class="brand" style="font-size:22px">Hear<span>Me</span></div>
  <h1>Try it on your phone</h1>
  <p>Join the same Wi-Fi as this laptop, then scan. You become the passenger in seat 23C.</p>
  <p><code>${esc(phoneUrl)}</code></p>
  <p class="note">The demo hub uses its own certificate. If your browser warns you, choose “Advanced → Continue”: the microphone only works on secure pages.</p>
  <p><a href="${esc(crewUrl)}">Crew console</a> · <a href="${esc(stageUrl)}">Demo stage</a> · <a href="/seats">Seat cards</a></p></div>
  </main></body></html>`;
}

/** How to make a phone trust the hub (mkcert's local CA), so the microphone works without a warning. */
export function trustPage(trusted: boolean, phoneUrl: string, caUrl: string): string {
  const body = trusted
    ? `<p>Do this once on the <b>demo phone</b>, then the phone app opens with no warning.</p>
       <p><a class="btn" href="${caUrl}">Download the cabin certificate</a></p>
       <h2>iPhone</h2>
       <ol><li>Open this page in <b>Safari</b> and download the certificate. Choose <b>Allow</b>.</li>
       <li>Settings → <b>Profile Downloaded</b> → Install.</li>
       <li>Settings → General → About → <b>Certificate Trust Settings</b> → switch on <b>mkcert</b>.</li></ol>
       <h2>Android</h2>
       <ol><li>Download the certificate.</li>
       <li>Settings → Security → Encryption &amp; credentials → <b>Install a certificate</b> → CA certificate → choose the file.</li></ol>
       <p class="warn"><b>Use a test phone only, and remove the certificate after the demo</b> (iPhone: Settings → General → VPN &amp; Device Management; Android: Trusted credentials → User). A phone that trusts it would also trust any site signed with this laptop's key.</p>
       <p>Then open: <a href="${phoneUrl}">${phoneUrl}</a></p>`
    : `<p>This hub uses a self-signed certificate: phones show a warning once (Advanced → Continue). For no warning, install <code>mkcert</code> on the laptop (<code>brew install mkcert</code>) and restart the hub.</p>
       <p>Then open: <a href="${phoneUrl}">${phoneUrl}</a></p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HearMe · trust the cabin hub</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#13233a}h1{font-size:26px}h2{font-size:18px;margin-top:22px}
.btn{display:inline-block;background:#ff8a65;color:#0b1630;font-weight:700;padding:12px 18px;border-radius:999px;text-decoration:none}.warn{background:#fff4e5;padding:12px;border-radius:10px}li{margin:6px 0}</style>
</head><body><h1>Use HearMe on a phone without a warning</h1>${body}</body></html>`;
}
