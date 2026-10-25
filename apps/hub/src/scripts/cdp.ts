/**
 * Minimal Chrome DevTools protocol client for the demo recorder and the
 * accessibility check: start headless Chrome, talk to its first page.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';

export const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const PORT = 9339;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Headless Chrome with a DevTools port, a throwaway profile and microphone permission granted. */
export function startChrome(profileDir: string, [W, H]: [number, number]): ChildProcess {
  return spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
      `--window-size=${W},${H}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-first-run',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
}

export class Cdp {
  private seq = 0;
  private pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
  private handlers = new Map<string, (params: Record<string, unknown>) => void>();

  private constructor(private ws: WebSocket) {
    ws.on('message', (data) => {
      const m = JSON.parse(String(data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> };
      const p = m.id ? this.pending.get(m.id) : undefined;
      if (p) {
        this.pending.delete(m.id!);
        if (m.error) p.fail(new Error(m.error.message));
        else p.ok(m.result);
      } else if (m.method) this.handlers.get(m.method)?.(m.params ?? {});
    });
  }

  static async connect(): Promise<Cdp> {
    for (let i = 0; i < 50; i++) {
      try {
        const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        const page = list.find((t) => t.type === 'page');
        if (page) {
          const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
          await new Promise((ok, fail) => ws.once('open', ok).once('error', fail));
          return new Cdp(ws);
        }
      } catch {
        // Chrome is still starting.
      }
      await sleep(200);
    }
    throw new Error('Could not reach Chrome');
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((ok, fail) => this.pending.set(id, { ok: ok as (v: unknown) => void, fail }));
  }

  on(method: string, fn: (params: Record<string, unknown>) => void) {
    this.handlers.set(method, fn);
  }

  async eval<T>(expression: string): Promise<T> {
    const r = await this.send<{ result: { value: T }; exceptionDetails?: { text: string } }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }

  close() {
    this.ws.close();
  }
}

