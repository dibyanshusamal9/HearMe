import { isOnlineLangCode } from '@hearme/shared';
import type { OnlineConfig } from './config';
import { ProviderError, providerJson, WorkPool } from './http';
import { SARVAM_CODES } from './translation';

/** Bulbul v3 includes Malayalam and Odia, which v4 Flash currently omits. */
export class OnlineVoice {
  private pool = new WorkPool(4);
  constructor(private config: OnlineConfig, private fetcher: typeof fetch = fetch) {}
  async synthesize(text: string, lang: string): Promise<Buffer> {
    if (!isOnlineLangCode(lang)) throw new ProviderError('Online speech voice supports ten Indian languages and English.', 400);
    text = text.trim();
    if (!text || text.length > 2500) throw new ProviderError('Spoken replies need 1–2500 characters.', 400);
    if (!this.config.sarvamKey) throw new ProviderError('Set SARVAM_API_KEY in the hub .env file to enable Online speech’s voice.');
    return this.pool.run(async () => {
      const result = await providerJson<{ audios?: unknown }>(this.fetcher, 'https://api.sarvam.ai/text-to-speech', {
        method: 'POST', headers: { 'api-subscription-key': this.config.sarvamKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language_code: SARVAM_CODES[lang], model: 'bulbul:v3', speaker: 'simran',
          output_audio_codec: 'mp3', speech_sample_rate: 22050, pace: 1 }),
      }, this.config.timeoutMs);
      // One text per request. Never silently discard extra provider audio segments.
      if (!Array.isArray(result.audios) || result.audios.length !== 1 || typeof result.audios[0] !== 'string' ||
          !result.audios[0] || result.audios[0].length > 6_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audios[0])) {
        throw new ProviderError('Online speech’s voice returned invalid audio. Try reading the reply again.');
      }
      return Buffer.from(result.audios[0], 'base64');
    });
  }
}
