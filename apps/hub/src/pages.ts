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

export async function seatCardsPage(urlFor: (seat: string) => string, seats: string[]): Promise<string> {
  const picks = COMMON_NEEDS.filter((n) => EMOJI[n.id]).slice(0, 8);
  const cards = await Promise.all(
    seats.map(async (seat) => {
      const url = urlFor(seat);
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
  <p><a href="${esc(phoneUrl)}">Open HearMe in your browser</a></p>
  <p class="note">No app download or installation needed. Tap a picture or type your request. Voice input is available when the cabin uses trusted HTTPS.</p>
  <p><a href="${esc(crewUrl)}">Crew console</a> · <a href="${esc(stageUrl)}">Demo stage</a> · <a href="/seats">Seat cards</a></p></div>
  </main></body></html>`;
}

export interface TrustPageInfo {
  /** Where the root came from; 'custom' with no root means a publicly trusted certificate. */
  source: 'custom' | 'mkcert' | 'local-ca' | 'none';
  caName: string;
  caFingerprint: string | null;
  /** https base of the hub, e.g. https://192.168.1.20:8443 */
  secureBase: string | null;
  /** Path to open after the check, e.g. /mobile/?seat=23C (always same-site). */
  next: string;
}

/**
 * /trust — served over plain http, because the phone does not trust the hub
 * yet. Installs the hub's root certificate the way each platform allows,
 * then checks the secure connection and opens HearMe without a warning.
 * Only the root's public certificate is offered; its key stays on the laptop.
 */
export function trustPage(info: TrustPageInfo): string {
  const fp = info.caFingerprint ?? '';
  const shortFp = fp ? `${fp.slice(0, 11)} … ${fp.slice(-11)}` : '';
  const data = JSON.stringify({ secureBase: info.secureBase, next: info.next, source: info.source }).replace(/</g, '\\u003c');
  const nothingToInstall = info.source === 'custom' && !info.caFingerprint;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>HearMe · Set up voice</title><style>${BASE_CSS}
  body{padding:18px;max-width:560px;margin:0 auto;line-height:1.45}
  h1{font-size:25px;margin:10px 0 4px;letter-spacing:-.01em}
  .lead{color:#46546B;margin:0 0 14px}
  .box{background:#fff;border-radius:18px;padding:16px 18px;margin:12px 0;box-shadow:0 8px 24px rgba(19,35,58,.08)}
  .ok{background:#E3F5EC;color:#14532D}.warn{background:#FFF3D6;color:#6B4A00}
  .btn{display:block;text-align:center;font:inherit;font-weight:800;font-size:18px;border:0;border-radius:14px;padding:16px;margin:10px 0;background:#13233A;color:#fff;text-decoration:none;cursor:pointer;width:100%}
  .btn.primary{background:#C8432A}.btn.ghost{background:#fff;color:#13233A;border:2px solid #D6DCE5}
  ol{margin:6px 0 0;padding-left:22px}li{margin:6px 0}
  b.k{background:#F4F6FA;border-radius:6px;padding:1px 6px;font-weight:700}
  .fp{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#46546B;word-break:break-all}
  .step{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#13233A;color:#fff;font-weight:800;font-size:14px;margin-right:6px}
  details{margin-top:8px}summary{cursor:pointer;font-weight:700}
  [hidden]{display:none!important}
  </style></head><body>
  <div class="brand" style="font-size:22px">Hear<span>Me</span></div>
  <h1>Set up voice on this phone</h1>
  <p class="lead">Your cabin connection and microphone access are separate. Phone browsers need a secure HTTPS page to use the microphone. This page checks the secure connection and shows any setup needed for this local demo.</p>

  <div id="checking" class="box">Checking the secure connection to the hub…</div>
  <div id="trusted" class="box ok" hidden><b>✓ This phone already trusts the hub.</b> Opening HearMe…<a class="btn primary" id="open1" href="#">Open HearMe</a></div>

  <div id="install" hidden>
  ${
    info.source === 'none'
      ? `<div class="box warn">This hub is running without HTTPS, so phones cannot use the microphone. Tapping pictures and typing still work. <a class="btn primary" href="${esc(info.next)}">Open HearMe</a></div>`
      : nothingToInstall
      ? `<div class="box ok">This hub uses a publicly trusted certificate: there is nothing to install. <a class="btn primary" id="open0" href="#">Open HearMe</a></div>`
      : `
  <div class="box" data-os="ios" hidden>
    <p><span class="step">1</span><b>Install</b></p>
    <a class="btn primary" href="/trust/hearme.mobileconfig">Install HearMe certificate</a>
    <ol><li>Tap <b class="k">Allow</b>, then <b class="k">Close</b>.</li>
    <li>Open <b>Settings</b> → <b class="k">Profile Downloaded</b> → <b class="k">Install</b> (enter your passcode) → <b class="k">Install</b> → <b class="k">Done</b>.</li></ol>
    <p><span class="step">2</span><b>Turn on trust</b> (iOS asks for this separately)</p>
    <ol><li><b>Settings</b> → <b>General</b> → <b>About</b> → <b class="k">Certificate Trust Settings</b>.</li>
    <li>Switch on <b>${esc(info.caName)}</b> → <b class="k">Continue</b>.</li></ol>
  </div>
  <div class="box" data-os="android" hidden>
    <p><span class="step">1</span><b>Download</b></p>
    <a class="btn primary" href="/trust/hearme-ca.crt" download="hearme-ca.crt">Download HearMe certificate</a>
    <p><span class="step">2</span><b>Install</b></p>
    <ol><li>If Android offers to install it right away: name it <b class="k">HearMe</b> → <b class="k">OK</b>.</li>
    <li>Otherwise (Android 11 and newer): <b>Settings</b> → <b>Security</b> (or <b>Security &amp; privacy</b>) → <b>More security settings</b> → <b>Encryption &amp; credentials</b> → <b class="k">Install a certificate</b> → <b class="k">CA certificate</b> → <b class="k">Install anyway</b> → choose <b>hearme-ca.crt</b> from Downloads.</li></ol>
  </div>
  <div class="box" data-os="other" hidden>
    <p><span class="step">1</span><b>Download</b> and add it to this computer's trusted roots.</p>
    <a class="btn primary" href="/trust/hearme-ca.pem" download="hearme-ca.pem">Download HearMe certificate</a>
    <p>On the laptop that runs the hub with mkcert, <code>mkcert -install</code> already did this.</p>
  </div>
  <div class="box">
    <p><span class="step">3</span><b>Check and open HearMe</b></p>
    <button class="btn" id="check">I installed it: check again</button>
    <p id="notyet" class="warn box" hidden>Not trusted yet. Finish every step above (on iPhone, also step 2), then check again.</p>
  </div>`
  }
  <div class="box">
    <details><summary>Is this safe?</summary>
    <p>The certificate is <b>${esc(info.caName)}</b>. It was created on the laptop running this demo hub, and its private key never leaves it. Installing it lets this phone trust that laptop's HTTPS pages.</p>
    ${shortFp ? `<p>Its fingerprint (SHA-256), also printed in the laptop's terminal:<br><span class="fp">${esc(fp)}</span></p>` : ''}
    <p><b>Remove it after the event.</b> iPhone: Settings → General → VPN &amp; Device Management → HearMe demo hub → Remove Profile. Android: Settings → Encryption &amp; credentials → User credentials → remove HearMe.</p></details>
    <details><summary>Skip this</summary>
    <p>Tap pictures and typing work without it: <a href="/mobile/?seat=${esc(seatFrom(info.next))}">open HearMe without the microphone</a>.</p></details>
  </div>
  </div>
  <script>
  (function () {
    var cfg = ${data};
    var ua = navigator.userAgent;
    var os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'other';
    document.querySelectorAll('[data-os="' + os + '"]').forEach(function (el) { el.hidden = false; });
    var target = cfg.secureBase ? cfg.secureBase + cfg.next : cfg.next;
    document.querySelectorAll('#open0,#open1').forEach(function (a) { a.href = target; });
    function show(id) { ['checking', 'trusted', 'install'].forEach(function (x) { document.getElementById(x).hidden = x !== id; }); }
    function check(manual) {
      if (!cfg.secureBase) return show('install');
      if (location.protocol === 'https:') { show('trusted'); return void setTimeout(function () { location.href = target; }, 400); }
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; fail(); } }, 4000);
      fetch(cfg.secureBase + '/api/status', { cache: 'no-store' }).then(function (r) {
        if (done) return; done = true; clearTimeout(timer);
        if (!r.ok) return fail();
        show('trusted');
        setTimeout(function () { location.href = target; }, 600);
      }, function () { if (!done) { done = true; clearTimeout(timer); fail(); } });
      function fail() { show('install'); var n = document.getElementById('notyet'); if (n) n.hidden = !manual; }
    }
    var btn = document.getElementById('check');
    if (btn) btn.addEventListener('click', function () { check(true); });
    check(false);
  })();
  </script>
  </body></html>`;
}

function seatFrom(next: string): string {
  return /seat=([0-9]{1,2}[A-K])/.exec(next)?.[1] ?? '23C';
}
