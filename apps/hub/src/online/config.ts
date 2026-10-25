/** Only the hub reads credentials. Never import this module into a client. */
export interface OnlineConfig {
  sarvamKey: string;
  groqKey: string;
  groqModel: string;
  speechModel: string;
  timeoutMs: number;
}
export function onlineConfig(): OnlineConfig {
  return {
    sarvamKey: process.env.SARVAM_API_KEY ?? '',
    groqKey: process.env.GROQ_API_KEY ?? '',
    groqModel: process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b',
    speechModel: process.env.SARVAM_STT_MODEL ?? 'saaras:v4',
    timeoutMs: Math.min(30_000, Math.max(1000, Number(process.env.HEARME_API_TIMEOUT_MS) || 12_000)),
  };
}
