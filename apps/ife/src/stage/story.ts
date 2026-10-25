import { BODY_AREAS, SYMPTOMS, translator } from '@hearme/shared';

/**
 * The scripted demo, run live on the stage by one button.
 *
 * It drives the real apps in their iframes the way a presenter would (taps on
 * the real buttons, marked on screen) and the real hub does the work: Sharda's
 * recorded sentence goes through Whisper and matching on this laptop, the
 * crew tablet receives it, the reply comes back and is read aloud. Only the
 * person is scripted, not the system. Each step waits for the real result;
 * if one does not come, the presenter chooses: try again, skip, or stop.
 */

const hi = translator('hi');
export const PHONE = 'Passenger phone';
export const CREW = 'Crew console';

export type Query = { text?: string; label?: string; css?: string; has?: string };
export type FailChoice = 'retry' | 'skip' | 'stop';
/** How Sharda's sentence got in: a person's recording, a computer voice reading it, or typed. */
export type HeardBy = 'recorded' | 'synthesized' | 'typed';

export interface StoryHost {
  frame(title: string): HTMLIFrameElement | null;
  /** Clear the hub's requests and reload both apps. */
  reset(): Promise<void>;
  caption(text: string | null): void;
  /** Mark a tap at stage (top window) coordinates. */
  tapMark(x: number, y: number): void;
  /** Start playing the clip aloud; returns its loudness per 100 ms and length. */
  playClip(wav: ArrayBuffer): Promise<{ levels: number[]; seconds: number }>;
  /** Ask the hub to warm its models (no-op if it cannot). */
  warmup(): Promise<void>;
  /** Is the hub's speech model ready to understand a recording? */
  speechReady(): Promise<boolean>;
  /** A step did not complete: what should happen? */
  onFail(step: StoryStep, reason: string): Promise<FailChoice>;
  onStep(index: number, step: StoryStep): void;
}

export interface StoryStep {
  id: string;
  title: string;
  run(c: StoryContext): Promise<void>;
}

export class StoryStopped extends Error {}
class StepFailed extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The element a finger could touch for this query (visible, on top), like the recorded demo's finder. */
export function findIn(frame: HTMLIFrameElement | null, q: Query): Element | null {
  const d = frame?.contentDocument;
  if (!d?.body) return null;
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  let els: Element[];
  if (q.css) els = [...d.querySelectorAll(q.css)];
  else if (q.label) els = [...d.querySelectorAll('[aria-label]')].filter((e) => e.getAttribute('aria-label') === q.label);
  else els = [...d.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && (e.textContent ?? '').trim() === q.text);
  if (q.has) els = els.filter((e) => (e.textContent ?? '').includes(q.has!));
  els = els.filter(visible);
  const onTop = (e: Element) => {
    const r = e.getBoundingClientRect();
    const hit = d.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && hit !== d.body && hit !== d.documentElement && (hit === e || e.contains(hit) || hit.contains(e));
  };
  let e = els.find(onTop);
  if (!e && els.length) {
    els[els.length - 1]!.scrollIntoView({ block: 'center', inline: 'center' });
    e = els.find(onTop);
  }
  return e ?? null;
}

/** A tap the apps handle like a finger's: pointer + mouse down/up, then click, made in the iframe's own window. */
export function tapIn(frame: HTMLIFrameElement, el: Element): { x: number; y: number } {
  const w = frame.contentWindow as (Window & typeof globalThis) | null;
  const d = frame.contentDocument;
  if (!w || !d) throw new Error('frame not loaded');
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const target = d.elementFromPoint(x, y) ?? el;
  const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: w, button: 0 };
  const pointer = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  target.dispatchEvent(new w.PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
  target.dispatchEvent(new w.MouseEvent('mousedown', { ...base, buttons: 1 }));
  target.dispatchEvent(new w.PointerEvent('pointerup', { ...pointer, buttons: 0 }));
  target.dispatchEvent(new w.MouseEvent('mouseup', { ...base, buttons: 0 }));
  target.dispatchEvent(new w.MouseEvent('click', { ...base, buttons: 0 }));
  const f = frame.getBoundingClientRect();
  return { x: f.left + frame.clientLeft + x, y: f.top + frame.clientTop + y };
}

export class StoryContext {
  heardBy: HeardBy | null = null;

  constructor(
    readonly host: StoryHost,
    private stopped: () => boolean,
  ) {}

  check(): void {
    if (this.stopped()) throw new StoryStopped();
  }

  async pause(ms: number): Promise<void> {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      this.check();
      await sleep(Math.min(100, until - Date.now()));
    }
  }

  caption(text: string): void {
    this.host.caption(text);
  }

  /** Wait until the element exists (the real app got there), or fail the step. */
  async waitFor(frameTitle: string, q: Query, timeoutMs: number, what = 'the next screen'): Promise<Element> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      this.check();
      const el = findIn(this.host.frame(frameTitle), q);
      if (el) return el;
      if (Date.now() > until) throw new StepFailed(`${what} did not appear within ${Math.round(timeoutMs / 1000)} s`);
      await sleep(200);
    }
  }

  async tap(frameTitle: string, q: Query, timeoutMs = 10_000): Promise<void> {
    await this.waitFor(frameTitle, q, timeoutMs, `“${q.text ?? q.label ?? q.has ?? q.css}”`);
    await this.pause(250); // let any scrolling settle, then find it again where it now is
    const el = findIn(this.host.frame(frameTitle), q);
    const frame = this.host.frame(frameTitle);
    if (!el || !frame) throw new StepFailed(`could not tap “${q.text ?? q.label ?? q.css}”`);
    const at = tapIn(frame, el);
    this.host.tapMark(at.x, at.y);
  }

  /** Types into the phone's text box like a person would (used when there is no recording). */
  async typeInto(frameTitle: string, text: string): Promise<void> {
    const frame = this.host.frame(frameTitle);
    const w = frame?.contentWindow as (Window & typeof globalThis) | null;
    const box = (await this.waitFor(frameTitle, { css: 'textarea, input[type="text"], input:not([type])' }, 8000, 'the text box')) as HTMLTextAreaElement | HTMLInputElement;
    if (!w) throw new StepFailed('phone not loaded');
    const proto = box instanceof w.HTMLTextAreaElement ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
    const setValue = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    box.focus();
    const chars = [...text];
    for (let i = 1; i <= chars.length; i++) {
      this.check();
      setValue.call(box, chars.slice(0, i).join(''));
      box.dispatchEvent(new w.Event('input', { bubbles: true }));
      await sleep(45);
    }
  }
}

async function fetchClip(): Promise<{ wav: ArrayBuffer; source: HeardBy } | null> {
  try {
    const res = await fetch('/api/story/voice?lang=hi', { cache: 'no-store' });
    if (!res.ok) return null;
    return { wav: await res.arrayBuffer(), source: res.headers.get('X-HearMe-Voice') === 'synthesized' ? 'synthesized' : 'recorded' };
  } catch {
    return null;
  }
}

/** Sharda's story: hot water for her medicine, then Care Mode. About 70 seconds. */
export const STORY: StoryStep[] = [
  {
    id: 'ready',
    title: 'Getting ready',
    async run(c) {
      c.caption('Getting the phone and the crew tablet ready…');
      void c.host.warmup();
      await c.host.reset();
      await c.waitFor(PHONE, { text: hi('onboard.useThis') }, 30_000, 'the phone');
      await c.waitFor(CREW, { css: '.crew2' }, 30_000, 'the crew tablet');
    },
  },
  {
    id: 'booking',
    title: 'Seat QR → booking',
    async run(c) {
      c.caption('Sharda is 68, in seat 23C. She speaks only Hindi and is a little hard of hearing. She scanned the QR code on her seat; HearMe found her booking. No app, no typing.');
      await c.pause(4500);
      await c.tap(PHONE, { text: hi('onboard.useThis') });
      await c.waitFor(PHONE, { label: hi('home.holdToSpeak') }, 10_000, 'the home screen');
      await c.pause(800);
    },
  },
  {
    id: 'speak',
    title: 'She speaks Hindi',
    async run(c) {
      c.caption('She holds the microphone and says in Hindi: “I need hot water for my medicine.”');
      const phone = c.host.frame(PHONE);
      const director = (phone?.contentWindow as { __hearmeStory?: { speakClip(wav: ArrayBuffer, levels: number[], seconds: number): Promise<string | null> } } | null)
        ?.__hearmeStory;
      const clip = (await c.host.speechReady()) ? await fetchClip() : null;
      await c.pause(1200);
      let heard: string | null = null;
      if (clip && director) {
        const mic = findIn(phone, { label: hi('home.holdToSpeak') });
        if (mic && phone) {
          const r = mic.getBoundingClientRect();
          const f = phone.getBoundingClientRect();
          c.host.tapMark(f.left + phone.clientLeft + r.left + r.width / 2, f.top + phone.clientTop + r.top + r.height / 2);
        }
        const { levels, seconds } = await c.host.playClip(clip.wav.slice(0));
        const understanding = director.speakClip(clip.wav, levels, seconds);
        await c.pause(Math.max(800, seconds * 1000));
        c.caption('Whisper turns her voice into text and the matcher works out what she needs. Both run here on the crew tablet (this laptop), with no internet.');
        heard = await Promise.race([understanding, sleep(35_000).then(() => null)]);
        if (heard) c.heardBy = clip.source;
      }
      if (!heard) {
        // No recording on this laptop, or the speech model is not ready: the same sentence, typed.
        c.caption(clip ? 'Speech took too long this time, so she types the same sentence instead.' : 'No recording of her voice on this laptop, so she types the same sentence. Hold the mic yourself to try speech.');
        await c.tap(PHONE, { text: hi('home.typeInstead') });
        await c.typeInto(PHONE, 'मुझे दवाई के लिए गरम पानी चाहिए');
        await c.tap(PHONE, { text: hi('speech.findMatch') });
        c.heardBy = 'typed';
      }
      if (heard) await c.waitFor(CREW, { css: '.crew2-card', has: '23C' }, 25_000, 'the automatically submitted request');
      else await c.waitFor(PHONE, { text: hi('review.send') }, 25_000, 'the understood request');
    },
  },
  {
    id: 'send',
    title: 'Understood → send',
    async run(c) {
      c.caption(c.heardBy === 'typed' ? 'Understood: hot water, to take medicine. She checks the picture and sends it.' : 'Her pause ended the recording. Hot water for medicine was submitted automatically.');
      await c.pause(3500);
      if (c.heardBy === 'typed') await c.tap(PHONE, { text: hi('review.send') });
      await c.pause(1500);
    },
  },
  {
    id: 'crew',
    title: 'Crew see it in Japanese',
    async run(c) {
      c.caption('Aoi’s tablet shows it in Japanese before anyone walks over: 23C · お湯 · 服薬のため. Her language and that she is hard of hearing come with it.');
      await c.tap(CREW, { css: '.crew2-card', has: '23C' }, 15_000);
      await c.pause(4500);
    },
  },
  {
    id: 'reply',
    title: 'One-tap verified reply',
    async run(c) {
      c.caption('One tap on a verified reply. Only checked translations ever reach a passenger.');
      await c.pause(1500);
      await c.tap(CREW, { css: '.crew2-reply.suggested' });
      await c.waitFor(PHONE, { text: hi('requests.thanks') }, 15_000, 'the reply on the phone');
      c.caption('Sharda sees it in Hindi and hears it read aloud: “हम इसे तुरंत ला रहे हैं।” (We are bringing it to you now.)');
      await c.pause(5000);
      await c.tap(PHONE, { text: hi('requests.thanks') });
      c.caption('She says thank you. The crew’s dashboard counts how long the answer took.');
      await c.pause(3500);
    },
  },
  {
    id: 'care',
    title: 'Care Mode',
    async run(c) {
      c.caption('Later she feels unwell. Care Mode: where it hurts and how much, without needing words.');
      await c.tap(PHONE, { text: hi('care.open') });
      await c.pause(1200);
      await c.tap(PHONE, { text: BODY_AREAS.find((a) => a.id === 'chest')!.label.hi });
      await c.pause(600);
      await c.tap(PHONE, { label: '8' });
      await c.pause(600);
      await c.tap(PHONE, { text: SYMPTOMS.find((s) => s.id === 'breathing')!.label.hi });
      await c.pause(1500);
      await c.tap(PHONE, { text: hi('care.send') });
      await c.pause(1200);
    },
  },
  {
    id: 'urgent',
    title: 'Urgent → doctor call',
    async run(c) {
      c.caption('The crew get it first, in red, in Japanese and English: chest, pain 8 of 10, hard to breathe.');
      await c.tap(CREW, { css: '.crew2-card.urgent' }, 15_000);
      await c.pause(4000);
      c.caption('One tap asks for a doctor on board. Every seat shows the call in its own language.');
      await c.tap(CREW, { css: '.crew2-btn', has: 'Ask for a doctor' });
      await c.pause(4500);
    },
  },
];

/** Runs the story; resolves 'done' or 'stopped'. */
export class StoryRunner {
  private stopFlag = false;
  /** How her sentence got in, once the run is over. */
  heardBy: HeardBy | null = null;

  constructor(
    private host: StoryHost,
    private steps: StoryStep[] = STORY,
  ) {}

  stop(): void {
    this.stopFlag = true;
  }

  async run(from = 0): Promise<'done' | 'stopped'> {
    const ctx = new StoryContext(this.host, () => this.stopFlag);
    for (let i = from; i < this.steps.length; i++) {
      const step = this.steps[i]!;
      this.host.onStep(i, step);
      try {
        await step.run(ctx);
      } catch (e) {
        if (e instanceof StoryStopped || this.stopFlag) return 'stopped';
        const choice = await this.host.onFail(step, e instanceof Error ? e.message : String(e));
        if (choice === 'stop') return 'stopped';
        if (choice === 'retry') i -= 1;
      }
    }
    this.host.caption(null);
    this.heardBy = ctx.heardBy;
    return this.stopFlag ? 'stopped' : 'done';
  }
}
