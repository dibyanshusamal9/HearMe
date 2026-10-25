import { spawn, spawnSync } from 'node:child_process';
import { resampleTo16k } from '@hearme/shared';

/**
 * Turn an uploaded recording into 16 kHz mono float samples for Whisper.
 *  - audio/L16 (16-bit PCM, 16 kHz mono): what the web apps send
 *  - WAV (PCM16 or float32, any rate/channels)
 *  - anything else (webm, m4a, aac, 3gp from native phones) via ffmpeg, if installed
 * Audio only lives in memory for the length of the request.
 */

export class AudioError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let ffmpegChecked: boolean | null = null;
export function hasFfmpeg(): boolean {
  if (ffmpegChecked === null) {
    try {
      ffmpegChecked = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 3000 }).status === 0;
    } catch {
      ffmpegChecked = false;
    }
  }
  return ffmpegChecked;
}

function pcm16ToFloat(buf: Buffer): Float32Array {
  const n = Math.floor(buf.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2) / 0x8000;
  return out;
}

function parseWav(buf: Buffer): Float32Array {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new AudioError('not a WAV file', 415);
  }
  let pos = 12;
  let format = 0;
  let channels = 1;
  let rate = 16000;
  let bits = 16;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      rate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      const data = buf.subarray(body, Math.min(buf.length, body + size));
      const frames = Math.floor(data.length / ((bits / 8) * channels));
      const mono = new Float32Array(frames);
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const at = (f * channels + c) * (bits / 8);
          if (format === 3 && bits === 32) sum += data.readFloatLE(at);
          else if (format === 1 && bits === 16) sum += data.readInt16LE(at) / 0x8000;
          else throw new AudioError('unsupported WAV encoding', 415);
        }
        mono[f] = sum / channels;
      }
      return resampleTo16k(mono, rate);
    }
    pos = body + size + (size % 2);
  }
  throw new AudioError('WAV has no data', 415);
}

function viaFfmpeg(buf: Buffer): Promise<Float32Array> {
  if (!hasFfmpeg()) return Promise.reject(new AudioError('this hub cannot decode compressed audio (install ffmpeg)', 415));
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1']);
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new AudioError('audio decode timed out', 400));
    }, 10_000);
    p.stdout.on('data', (c: Buffer) => chunks.push(c));
    p.on('error', () => reject(new AudioError('audio decode failed', 400)));
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new AudioError('audio decode failed', 400));
      const all = Buffer.concat(chunks);
      resolve(new Float32Array(all.buffer, all.byteOffset, Math.floor(all.length / 4)).slice());
    });
    p.stdin.on('error', () => undefined);
    p.stdin.end(buf);
  });
}

export async function decodeAudio(buf: Buffer, contentType: string | undefined): Promise<Float32Array> {
  const type = (contentType ?? '').toLowerCase();
  if (buf.length === 0) throw new AudioError('empty audio', 400);
  if (type.startsWith('audio/l16') || type.startsWith('application/octet-stream')) {
    const rate = Number(/rate=(\d+)/.exec(type)?.[1] ?? 16000);
    const samples = pcm16ToFloat(buf);
    return rate === 16000 ? samples : resampleTo16k(samples, rate);
  }
  if (type.includes('wav') || buf.toString('ascii', 0, 4) === 'RIFF') return parseWav(buf);
  return viaFfmpeg(buf);
}

/** 16 kHz mono float samples → a 16-bit PCM WAV file (voice lab recordings, the story's voice). */
export function encodeWav(samples: Float32Array, rate = 16000): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 0x7fff), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
