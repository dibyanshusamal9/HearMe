import type { OnlineConfig } from './config';
import { ProviderError, providerJson, WorkPool } from './http';
export class GroqClient {
  private pool = new WorkPool();
  constructor(private config: OnlineConfig, private fetcher: typeof fetch = fetch) {}
  async json<T>(instruction: string, data: unknown, schema: Record<string, unknown>): Promise<T> {
    if (!this.config.groqKey) throw new ProviderError('Set GROQ_API_KEY in the hub .env file to enable Online speech.');
    return this.pool.run(async () => {
      const result = await providerJson<{ choices?: { message?: { content?: string } }[] }>(this.fetcher,
        'https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${this.config.groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.config.groqModel, temperature: 0.2, max_completion_tokens: 1024, reasoning_effort: 'low',
            messages: [{ role: 'system', content: instruction }, { role: 'user', content: JSON.stringify(data) }],
            response_format: { type: 'json_schema', json_schema: { name: 'tara_result', strict: true, schema } },
          }),
        }, this.config.timeoutMs);
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new ProviderError('Online speech returned an empty answer. Please try again.');
      try { return JSON.parse(content) as T; }
      catch { throw new ProviderError('Online speech returned an invalid answer. Please try again.'); }
    });
  }
}
export const textSchema = (key: string) => ({ type: 'object', additionalProperties: false, required: [key], properties: { [key]: { type: 'string' } } });
