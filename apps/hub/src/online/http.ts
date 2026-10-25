export class ProviderError extends Error {
  constructor(message: string, readonly status = 503) { super(message); }
}
/** Abort the actual network request; never expose provider bodies or credentials. */
export async function providerJson<T>(fetcher: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  try {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new ProviderError(`Online provider returned ${response.status}. ${response.status === 429 ? 'Please try again shortly.' : 'Check the hub credentials and provider availability.'}`);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('Online service could not respond. Check your connection and try again.');
  }
}
/** Bound both active and waiting work. */
export class WorkPool {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private limit = 6, private maxWaiting = 24) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      if (this.waiting.length >= this.maxWaiting) throw new ProviderError('Online speech is busy. Please try again shortly.', 429);
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else this.active++;
    try { return await work(); }
    finally { const next = this.waiting.shift(); if (next) next(); else this.active--; }
  }
}
