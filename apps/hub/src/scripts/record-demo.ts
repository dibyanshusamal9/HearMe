/**
 * Records the backup demo video (docs/demo.mp4) from the demo stage, driven
 * the way a presenter would: Sharda's phone (Hindi) on the left, the crew
 * tablet (Japanese) on the right, the cabin network in the middle.
 *
 * Nothing is mocked: the phone's microphone hears a Hindi recording (macOS
 * `say`), the hub's offline Whisper and e5 understand it, and the crew answer
 * with one tap. Captions explain each step for viewers.
 *
 *   npm run record-demo     starts the hub if needed; needs Google Chrome, ffmpeg and macOS `say`
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_AREAS, SYMPTOMS, translator } from '@hearme/shared';
import { Cdp, startChrome } from './cdp';

const HUB_DIR = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const WORK = join(HUB_DIR, '.eval', 'video');
const FRAMES = join(WORK, 'frames');
const OUT = join(ROOT, 'docs', 'demo.mp4');
const HUB = 'http://localhost:8080';
const [W, H] = [1600, 900];
const hi = translator('hi');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Hub, voice, browser ───────────────────────────────────────────────────
async function hubReady(): Promise<boolean> {
  try {
    const s = (await (await fetch(`${HUB}/api/status`)).json()) as { asr: { state: string }; embed: { state: string } };
    return s.asr.state === 'ready' && s.embed.state === 'ready';
  } catch {
    return false;
  }
}

async function startHub(): Promise<ChildProcess | null> {
  if (await hubReady()) return null;
  console.log('Starting the cabin hub (loading Whisper and e5) …');
  const hub = spawn('npx', ['tsx', 'src/main.ts'], {
    cwd: HUB_DIR,
    env: { ...process.env, HEARME_THREADS: process.env.HEARME_THREADS ?? '3' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 240; i++) {
    if (await hubReady()) return hub;
    await sleep(1000);
  }
  hub.kill();
  throw new Error('The hub was not ready after 4 minutes');
}

/** "I need hot water for my medicine" in Hindi, with a little silence around it. */
function makeVoice(): string {
  const aiff = join(WORK, 'hi.aiff');
  const wav = join(WORK, 'hi.wav');
  execFileSync('say', ['-v', 'Lekha', '-o', aiff, 'मुझे दवाई के लिए गरम पानी चाहिए']);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', aiff, '-af', 'adelay=400,apad=pad_dur=2', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  return wav;
}

/**
 * The phone's microphone hears the recording: getUserMedia returns a stream
 * that plays it from the start, the way a person would start speaking after
 * tapping the mic. Everything after that (capture, Whisper, matching) is real.
 */
function micScript(wav: string): string {
  return `(() => {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return;
    const real = md.getUserMedia.bind(md);
    const b64 = ${JSON.stringify(readFileSync(wav).toString('base64'))};
    md.getUserMedia = async (c) => {
      if (!c || !c.audio) return real(c);
      const ctx = new AudioContext();
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const src = ctx.createBufferSource();
      src.buffer = await ctx.decodeAudioData(bytes.buffer);
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  })();`;
}


// ── Page helpers: captions, tap marks, finding things inside the iframes ──
const PAGE_HELPERS = `
window.__caption = (text) => {
  let c = document.getElementById('__cap');
  if (!c) {
    c = document.createElement('div');
    c.id = '__cap';
    Object.assign(c.style, { position: 'fixed', left: '50%', bottom: '26px', transform: 'translateX(-50%)', width: '560px',
      padding: '14px 22px', borderRadius: '14px', background: 'rgba(10,18,36,.92)', color: '#fff', zIndex: 99999,
      font: '600 21px/1.4 "Noto Sans", system-ui, sans-serif', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,.35)' });
    document.body.appendChild(c);
  }
  c.textContent = text;
  c.style.display = text ? 'block' : 'none';
};
window.__card = (title, sub) => {
  let c = document.getElementById('__card');
  if (!c) {
    c = document.createElement('div');
    c.id = '__card';
    Object.assign(c.style, { position: 'fixed', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '18px', background: '#0b1630', color: '#fff', zIndex: 100000, font: '600 30px/1.4 "Noto Sans", system-ui, sans-serif', textAlign: 'center' });
    document.body.appendChild(c);
  }
  c.innerHTML = title ? '<div style="font-size:84px;font-weight:800">Hear<span style="color:#ff8a65">Me</span></div><div>' + title + '</div><div style="font-size:22px;opacity:.75;font-weight:500">' + (sub || '') + '</div>' : '';
  c.style.display = title ? 'flex' : 'none';
};
window.__tap = (x, y) => {
  const d = document.createElement('div');
  Object.assign(d.style, { position: 'fixed', left: (x - 22) + 'px', top: (y - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%',
    background: 'rgba(255,138,101,.45)', border: '3px solid #ff8a65', zIndex: 99998, pointerEvents: 'none', transition: 'transform .5s, opacity .5s' });
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.transform = 'scale(1.6)'; d.style.opacity = '0'; });
  setTimeout(() => d.remove(), 700);
};
window.__find = (title, q) => {
  const f = document.querySelector('iframe[title="' + title + '"]');
  const d = f && f.contentDocument;
  if (!d || !d.body) return null;
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  let els;
  if (q.css) els = [...d.querySelectorAll(q.css)];
  else if (q.label) els = [...d.querySelectorAll('[aria-label]')].filter((e) => e.getAttribute('aria-label') === q.label);
  else els = [...d.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && (e.textContent || '').trim() === q.text);
  if (q.has) els = els.filter((e) => (e.textContent || '').includes(q.has));
  els = els.filter(visible);
  if (!els.length) return null;
  // Only what a finger could touch: the element on top at its centre (not one hidden under a sheet).
  const onTop = (e) => {
    const r = e.getBoundingClientRect();
    const hit = d.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && hit !== d.body && hit !== d.documentElement && (hit === e || e.contains(hit) || hit.contains(e));
  };
  let e = els.find(onTop);
  if (!e) {
    els[els.length - 1].scrollIntoView({ block: 'center', inline: 'center' });
    e = els.find(onTop);
  }
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const o = f.getBoundingClientRect();
  return { x: Math.round(o.left + f.clientLeft + r.left + r.width / 2), y: Math.round(o.top + f.clientTop + r.top + r.height / 2) };
};
`;

type Query = { css?: string; label?: string; text?: string; has?: string };
const PHONE = 'Passenger phone';
const CREW = 'Crew console';

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  mkdirSync(join(ROOT, 'docs'), { recursive: true });

  const hub = await startHub();
  const voice = makeVoice();
  const chrome = startChrome(join(WORK, 'profile'), [W, H]);
  const cdp = await Cdp.connect();
  const cleanup = () => {
    cdp.close();
    chrome.kill();
    hub?.kill();
  };

  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: micScript(voice) });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `${HUB}/#/stage` });
    await sleep(5000);
    await cdp.eval(PAGE_HELPERS);

    // Record every painted frame with its time.
    const frames: { file: string; t: number; wall: number }[] = [];
    cdp.on('Page.screencastFrame', (p) => {
      const file = join(FRAMES, `${String(frames.length).padStart(5, '0')}.jpg`);
      writeFileSync(file, Buffer.from(p.data as string, 'base64'));
      frames.push({ file, t: (p.metadata as { timestamp: number }).timestamp, wall: Date.now() / 1000 });
      void cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId });
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

    const find = async (frame: string, q: Query, timeoutMs = 20000) => {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const p = await cdp.eval<{ x: number; y: number } | null>(`window.__find(${JSON.stringify(frame)}, ${JSON.stringify(q)})`);
        if (p) return p;
        if (Date.now() > until) throw new Error(`Not found in ${frame}: ${JSON.stringify(q)}`);
        await sleep(250);
      }
    };
    const press = async (frame: string, q: Query, holdMs = 90) => {
      const p = await find(frame, q);
      await sleep(250); // let scrolling settle
      const { x, y } = await find(frame, q);
      await cdp.eval(`window.__tap(${x}, ${y})`);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(holdMs);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return p;
    };
    const caption = (text: string) => cdp.eval(`window.__caption(${JSON.stringify(text)})`);
    const card = (title: string | null, sub = '') => cdp.eval(`window.__card(${JSON.stringify(title)}, ${JSON.stringify(sub)})`);

    // 1. Title
    await card('Passengers and cabin crew who share no language', 'Live recording of the working prototype · offline on one laptop');
    await sleep(4000);
    await card(null);
    await caption('Left: Sharda’s phone, seat 23C (Hindi). Right: the crew tablet (Japanese). Middle: what travels on the cabin network.');
    await sleep(5000);

    // 2. Seat QR → booking found
    await caption('She scanned the QR code on her seat. HearMe found her booking: language, seat, needs. No typing, no app store.');
    await sleep(2500);
    await press(PHONE, { text: hi('onboard.useThis') });
    await sleep(2500);

    // 3. Speak Hindi → Whisper → e5
    await caption('She holds the microphone and says in Hindi: “I need hot water for my medicine.”');
    await sleep(1500);
    await press(PHONE, { label: hi('home.holdToSpeak') }, 4500); // hold to talk
    await caption('Whisper turns her voice into text and e5 works out what she needs. Both run on this laptop, with no internet.');
    await find(PHONE, { text: hi('review.send') }, 40000);
    await sleep(3500);
    await caption('Understood: hot water, for her medicine. She checks the picture and sends.');
    await sleep(2000);
    await press(PHONE, { text: hi('review.send') });
    await sleep(2500);

    // 4. Crew reply
    await caption('Aoi reads it in Japanese: お湯, to take medicine. Seat, language and that Sharda is hard of hearing.');
    await press(CREW, { css: '.crew2-card' });
    await sleep(3000);
    await caption('One tap on a verified reply. Sharda sees and hears it in Hindi.');
    await press(CREW, { css: '.crew2-reply.suggested' });
    await sleep(3500);
    await press(PHONE, { text: hi('requests.thanks') });
    await caption('She says thank you. The crew see it, and the dashboard counts the answer time.');
    await sleep(4000);

    // 5. Care Mode
    await caption('Later Sharda feels unwell. Care Mode: where it hurts, how much, anything else.');
    await press(PHONE, { text: hi('care.open') });
    await sleep(1500);
    await press(PHONE, { text: BODY_AREAS.find((a) => a.id === 'chest')!.label.hi });
    await sleep(700);
    await press(PHONE, { label: '8' });
    await sleep(700);
    await press(PHONE, { text: SYMPTOMS.find((s) => s.id === 'breathing')!.label.hi });
    await sleep(1500);
    await press(PHONE, { text: hi('care.send') });
    await caption('The crew get it first, in red, in Japanese and English: chest, pain 8/10, hard to breathe.');
    await sleep(2000);
    await press(CREW, { css: '.crew2-card.urgent' });
    await sleep(3500);
    await caption('One tap asks for a doctor on board. Every seat shows the call in its own language.');
    await press(CREW, { css: '.crew2-btn', has: 'Ask for a doctor' });
    await sleep(4500);

    // 6. End
    await caption('');
    await card('Every message is meaning, not audio: verified phrases in both languages.', 'npm run demo · github.com/Dhruv-ux-dev/HearMe');
    await sleep(4000);
    await cdp.send('Page.stopScreencast');
    const stopped = Date.now() / 1000;

    // Turn the timed frames into a constant-rate video.
    const list = frames
      .map((f, i) => `file '${f.file}'\nduration ${Math.max(0.02, frames[i + 1] ? frames[i + 1]!.t - f.t : stopped - f.wall).toFixed(3)}`)
      .join('\n');
    writeFileSync(join(WORK, 'frames.txt'), `${list}\nfile '${frames[frames.length - 1]!.file}'\n`);
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(WORK, 'frames.txt'),
      '-vf', `fps=25,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-movflags', '+faststart', OUT,
    ]);
    copyFileSync(OUT, join(ROOT, 'apps', 'ife', 'public', 'demo.mp4')); // served by the hub at /demo.mp4
    console.log(`Saved ${OUT} (${frames.length} frames)`);
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
