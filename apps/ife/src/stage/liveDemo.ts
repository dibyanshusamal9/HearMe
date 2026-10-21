import { BODY_AREAS, SYMPTOMS, translator } from '@hearme/shared';

/**
 * The demo story, run live in the real apps on the stage: it taps the phone
 * and the crew tablet the way a presenter would, and plays Sharda's Hindi
 * request out loud while feeding the same recording to the phone's
 * microphone. Everything after the tap is real: Whisper, matching, the cabin
 * network, the crew tablet. It can be stopped at any time; afterwards the
 * judges can try it themselves.
 */

const PHONE = 'Passenger phone';
const CREW = 'Crew console';
const hi = translator('hi');

type Query = { text?: string; label?: string; css?: string; has?: string };

export interface LiveDemoHooks {
  caption: (text: string | null) => void;
  /** Clear requests and reload both screens (phone storage already cleared). */
  reset: () => void;
  showQr: () => void;
  signal: AbortSignal;
}

function frame(title: string): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`);
}

/** The element a finger could touch: visible, and on top at its centre. */
function find(title: string, q: Query): HTMLElement | null {
  const d = frame(title)?.contentDocument;
  if (!d?.body) return null;
  let els: HTMLElement[];
  if (q.css) els = [...d.querySelectorAll<HTMLElement>(q.css)];
  else if (q.label) els = [...d.querySelectorAll<HTMLElement>('[aria-label]')].filter((e) => e.getAttribute('aria-label') === q.label);
  else els = [...d.querySelectorAll<HTMLElement>('body *')].filter((e) => e.childElementCount === 0 && e.textContent?.trim() === q.text);
  if (q.has) els = els.filter((e) => e.textContent?.includes(q.has!));
  const onTop = (e: HTMLElement) => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const hit = d.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && hit !== d.body && (hit === e || e.contains(hit) || hit.contains(e));
  };
  let el = els.find(onTop);
  if (!el && els.length) {
    els[els.length - 1]!.scrollIntoView({ block: 'center' });
    el = els.find(onTop);
  }
  return el ?? null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), reject(new Error('stopped'))), { once: true });
  });
}

async function waitFor(title: string, q: Query, signal: AbortSignal, ms = 20_000): Promise<HTMLElement> {
  const until = Date.now() + ms;
  for (;;) {
    const el = find(title, q);
    if (el) return el;
    if (Date.now() > until) throw new Error(`waited too long for ${title === PHONE ? 'the phone' : 'the crew tablet'}`);
    await sleep(200, signal);
  }
}

/** A short pulse where the "finger" tapped, so the audience can follow. */
function tap(title: string, el: HTMLElement): void {
  el.scrollIntoView({ block: 'center' });
  const f = frame(title)!.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const dot = document.createElement('div');
  dot.className = 'stage-tap';
  dot.style.left = `${f.left + r.left + r.width / 2 - 20}px`;
  dot.style.top = `${f.top + r.top + r.height / 2 - 20}px`;
  document.body.appendChild(dot);
  setTimeout(() => dot.remove(), 700);
  el.click();
}

/**
 * The phone's microphone hears the recording (and the room hears it too):
 * getUserMedia in the phone frame returns a stream that plays it.
 */
async function speakIntoPhone(signal: AbortSignal): Promise<void> {
  const win = frame(PHONE)?.contentWindow as (Window & typeof globalThis) | null;
  if (!win) throw new Error('no phone');
  const ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(await (await fetch('/demo/hi-request.wav')).arrayBuffer());
  const md = win.navigator.mediaDevices;
  const real = md.getUserMedia.bind(md);
  md.getUserMedia = async (c?: MediaStreamConstraints) => {
    if (!c?.audio) return real(c);
    md.getUserMedia = real; // only once
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const dest = ctx.createMediaStreamDestination();
    src.connect(dest);
    src.connect(ctx.destination);
    src.start();
    signal.addEventListener('abort', () => src.stop(), { once: true });
    return dest.stream;
  };
}

export async function runLiveDemo({ caption, reset, showQr, signal }: LiveDemoHooks): Promise<void> {
  const say = async (text: string, ms = 2500) => {
    caption(text);
    await sleep(ms, signal);
  };
  // Fresh start: a new passenger at 23C, an empty crew list.
  try {
    frame(PHONE)?.contentWindow?.localStorage.clear();
  } catch {
    // another origin: keep the phone as it is
  }
  reset();
  await sleep(2500, signal);

  await say('Sharda, seat 23C, speaks only Hindi. She scanned the QR code on her seat: HearMe already knows her language.');
  const useThis = await waitFor(PHONE, { text: hi('onboard.useThis') }, signal, 6000).catch(() => null);
  if (useThis) tap(PHONE, useThis);

  await say('She asks, in Hindi: “I need hot water for my medicine.”', 1500);
  await speakIntoPhone(signal);
  tap(PHONE, await waitFor(PHONE, { label: hi('home.holdToSpeak') }, signal));
  await sleep(4300, signal);
  tap(PHONE, await waitFor(PHONE, { label: hi('speech.tapToFinish') }, signal));

  caption('Whisper (speech → text) and the matcher run on this laptop, offline.');
  const send = await waitFor(PHONE, { text: hi('review.send') }, signal, 40_000);
  await say('Understood: hot water, to take medicine. She checks the picture and sends it.');
  tap(PHONE, send);

  await say('Aoi, the crew member, reads it in Japanese, with the seat and that Sharda is hard of hearing.');
  tap(CREW, await waitFor(CREW, { css: '.crew2-card' }, signal));
  await say('One tap on a checked reply. No machine translation reaches the passenger.', 2000);
  tap(CREW, await waitFor(CREW, { css: '.crew2-reply.suggested' }, signal));

  const thanks = await waitFor(PHONE, { text: hi('requests.thanks') }, signal);
  await say('Sharda reads it, and hears it, in Hindi.', 3000);
  tap(PHONE, thanks);

  await say('Later she feels unwell. Care Mode: where it hurts, how much, anything else.');
  tap(PHONE, await waitFor(PHONE, { text: hi('care.open') }, signal));
  await sleep(1200, signal);
  tap(PHONE, await waitFor(PHONE, { text: BODY_AREAS.find((a) => a.id === 'chest')!.label.hi }, signal));
  await sleep(600, signal);
  tap(PHONE, await waitFor(PHONE, { label: '8' }, signal));
  await sleep(600, signal);
  tap(PHONE, await waitFor(PHONE, { text: SYMPTOMS.find((s) => s.id === 'breathing')!.label.hi }, signal));
  await sleep(1000, signal);
  tap(PHONE, await waitFor(PHONE, { text: hi('care.send') }, signal));

  await say('The crew get it first, in red, in Japanese and English: chest, pain 8 of 10, hard to breathe.');
  tap(CREW, await waitFor(CREW, { css: '.crew2-card.urgent' }, signal));
  await say('One tap asks for a doctor on board: every seat shows it in its own language.', 1500);
  tap(CREW, await waitFor(CREW, { css: '.crew2-btn', has: 'Ask for a doctor' }, signal));
  await sleep(4000, signal);

  showQr();
  caption('Your turn: scan the code and ask for anything, in your language.');
}
