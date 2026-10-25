/**
 * Noise reduction before Whisper: spectral subtraction with the noise
 * estimated from the quietest moments of the clip itself (minimum
 * statistics). Cabin noise is steady (engines, airflow, hum), which is what
 * this method assumes. Off by default; `npm run eval -- --speech --denoise`
 * measures whether it helps.
 */

const N = 512;
const HOP = 256;

function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] = re[i]! / n), (im[i] = im[i]! / n);
}

export function denoise(x: Float32Array, { overSubtract = 1.6, floor = 0.08 } = {}): Float32Array {
  if (x.length < N * 4) return x;
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const frames = Math.floor((x.length - N) / HOP) + 1;
  const bins = N / 2 + 1;
  const spectra: { re: Float64Array; im: Float64Array; mag: Float64Array }[] = [];
  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[f * HOP + i]! * win[i]!;
    fft(re, im, false);
    const mag = new Float64Array(bins);
    for (let k = 0; k < bins; k++) mag[k] = Math.hypot(re[k]!, im[k]!);
    spectra.push({ re, im, mag });
  }
  // Noise per frequency: the 10th percentile over time (speech is absent in the quietest frames).
  const noise = new Float64Array(bins);
  const column = new Float64Array(frames);
  for (let k = 0; k < bins; k++) {
    for (let f = 0; f < frames; f++) column[f] = spectra[f]!.mag[k]!;
    noise[k] = Float64Array.from(column).sort()[Math.floor(frames * 0.1)]!;
  }
  const out = new Float64Array(x.length);
  const norm = new Float64Array(x.length);
  let prevGain = new Float64Array(bins).fill(1);
  for (let f = 0; f < frames; f++) {
    const { re, im, mag } = spectra[f]!;
    const gain = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      const g = Math.max(floor, 1 - (overSubtract * noise[k]!) / Math.max(mag[k]!, 1e-9));
      gain[k] = 0.6 * g + 0.4 * prevGain[k]!; // smooth over time against "musical noise"
    }
    prevGain = gain;
    for (let k = 0; k < bins; k++) {
      re[k] = re[k]! * gain[k]!;
      im[k] = im[k]! * gain[k]!;
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k]!;
        im[N - k] = -im[k]!;
      }
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      out[f * HOP + i] = out[f * HOP + i]! + re[i]! * win[i]!;
      norm[f * HOP + i] = norm[f * HOP + i]! + win[i]! * win[i]!;
    }
  }
  return Float32Array.from(out, (v, i) => (norm[i]! > 1e-6 ? v / norm[i]! : 0));
}
