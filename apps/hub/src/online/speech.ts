import { findLanguage } from '@hearme/shared';
import type { OnlineConfig } from './config';
import { ProviderError, providerJson, WorkPool } from './http';
import { SARVAM_CODES } from './translation';
/** 16kHz mono PCM in a WAV container: no transcoder or disk access. */
export function wav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const label = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  label(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); label(8, 'WAVE'); label(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  label(36, 'data'); view.setUint32(40, bytes.length - 44, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true));
  return bytes;
}
export class OnlineSpeech {
  private pool = new WorkPool(6);
  constructor(private config: OnlineConfig, private fetcher: typeof fetch = fetch) {}
  transcribe(samples: Float32Array, language: string): Promise<string> {
    const lang = findLanguage(language)?.code ?? language;
    if (!findLanguage(lang)) throw new ProviderError('Unknown speech language.', 400);
    if (samples.length > 16000 * 30) throw new ProviderError('Record at most 30 seconds.', 400);
    return this.pool.run(async () => {
      const sarvam = !!SARVAM_CODES[lang];
      const key = sarvam ? this.config.sarvamKey : this.config.groqKey;
      if (!key) throw new ProviderError(`Set ${sarvam ? 'SARVAM_API_KEY' : 'GROQ_API_KEY'} in the hub .env file to enable speech.`);
      const form = new FormData();
      form.set('file', new Blob([wav(samples)], { type: 'audio/wav' }), 'speech.wav');
      form.set('model', sarvam ? this.config.speechModel : 'whisper-large-v3-turbo');
      form.set(sarvam ? 'language_code' : 'language', sarvam ? SARVAM_CODES[lang]! : lang);
      const response = await providerJson<{ transcript?: string; text?: string }>(this.fetcher,
        sarvam ? 'https://api.sarvam.ai/speech-to-text' : 'https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST', headers: sarvam ? { 'api-subscription-key': key } : { Authorization: `Bearer ${key}` }, body: form,
        }, this.config.timeoutMs);
      const transcript = sarvam ? response.transcript : response.text;
      if (typeof transcript !== 'string') throw new ProviderError('Speech provider returned an invalid transcript.');
      return transcript.trim();
    });
  }
}
