/**
 * Small Web Audio helpers for the demo: a chime when a request reaches the
 * crew console, and synthetic cabin noise (engine rumble + airflow hiss, at
 * roughly the spectrum of a cabin at cruise) to test speech in the room.
 */

type Ctx = AudioContext;
let shared: Ctx | null = null;
function ctx(): Ctx | null {
  const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
  if (!C) return null;
  shared ??= new C();
  if (shared.state === 'suspended') void shared.resume();
  return shared;
}

export function playChime(kind: 'new' | 'urgent' = 'new'): void {
  const c = ctx();
  if (!c) return;
  const notes = kind === 'urgent' ? [880, 660, 880, 660] : [660, 990];
  notes.forEach((f, i) => {
    const t = c.currentTime + i * 0.16;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.3);
  });
}

export class CabinNoise {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private volume = 0.5;

  get playing(): boolean {
    return this.source !== null;
  }

  start(volume = this.volume): void {
    const c = ctx();
    if (!c || this.source) return;
    const seconds = 6;
    const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    let hiss = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / c.sampleRate;
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      hiss = 0.85 * hiss + 0.15 * white;
      const hum = 0.25 * Math.sin(2 * Math.PI * 92 * t) + 0.12 * Math.sin(2 * Math.PI * 184 * t + 1);
      data[i] = 0.6 * (3.2 * brown + 0.35 * hiss + hum * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t)));
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = c.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(c.destination);
    source.start();
    this.source = source;
    this.gain = gain;
    this.volume = volume;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }

  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
  }
}
