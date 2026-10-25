import type { CabinBus } from './bus';
import type { ClientFrame, HubRole, ServerFrame } from './hubProtocol';
import type { CabinMessage, PassengerToCrew } from './protocol';

/**
 * The real cabin network: a WebSocket to the cabin hub (crew tablet service)
 * over the cabin Wi-Fi. Works in browsers, React Native and Node (pass a
 * factory). Reconnects with backoff; while disconnected nothing is sent, and
 * the link reports the device as offline so requests wait instead of being lost.
 */

/** The subset of the WebSocket API we use (browser, React Native and `ws` all provide it). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

/** Whether the transport under a link is up (used by `SimulatedCabinLink`). */
export interface TransportStatus {
  isUp(): boolean;
  onChange(listener: (up: boolean) => void): () => void;
}

export interface WebSocketBusOptions {
  role: HubRole;
  seat?: string;
  factory?: WebSocketFactory;
  /** First reconnect delay; doubles up to `maxReconnectMs`. */
  reconnectMs?: number;
  maxReconnectMs?: number;
}

const OPEN = 1;

function defaultFactory(): WebSocketFactory | null {
  const WS = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
  return WS ? (url) => new WS(url) : null;
}

export class WebSocketBus implements CabinBus, TransportStatus {
  private socket: WebSocketLike | null = null;
  private up = false;
  private closed = false;
  private retryMs: number;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private seat?: string;
  private cabinListeners = new Set<(m: CabinMessage) => void>();
  private frameListeners = new Set<(f: ServerFrame) => void>();
  private statusListeners = new Set<(up: boolean) => void>();
  private readonly factory: WebSocketFactory;
  private readonly role: HubRole;
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;

  constructor(
    private url: string,
    options: WebSocketBusOptions,
  ) {
    const factory = options.factory ?? defaultFactory();
    if (!factory) throw new Error('WebSocket is not available in this runtime');
    this.factory = factory;
    this.role = options.role;
    this.seat = options.seat;
    this.baseRetryMs = options.reconnectMs ?? 1000;
    this.maxRetryMs = options.maxReconnectMs ?? 8000;
    this.retryMs = this.baseRetryMs;
    this.connect();
  }

  // ── CabinBus ──────────────────────────────────────────────────────────
  post(message: CabinMessage): void {
    // Devices only post passenger messages; the hub validates and drops anything else.
    this.sendFrame({ kind: 'cabin', msg: message as PassengerToCrew });
  }

  subscribe(listener: (message: CabinMessage) => void): () => void {
    this.cabinListeners.add(listener);
    return () => this.cabinListeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.cabinListeners.clear();
    this.frameListeners.clear();
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onopen = s.onclose = s.onerror = null;
      s.onmessage = null;
      try {
        s.close();
      } catch {
        /* already closed */
      }
    }
    this.setUp(false);
    this.statusListeners.clear();
  }

  // ── TransportStatus ───────────────────────────────────────────────────
  isUp(): boolean {
    return this.up;
  }

  onChange(listener: (up: boolean) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  // ── Hub extras ────────────────────────────────────────────────────────
  /** Every frame from the hub (cabin messages, crew state, events). */
  onFrame(listener: (frame: ServerFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Returns false if the frame could not be sent (not connected). */
  sendFrame(frame: ClientFrame): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    try {
      this.socket.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  /** Tell the hub which seat this device is (passengers only receive their own seat's messages). */
  setSeat(seat: string | undefined): void {
    this.seat = seat;
    this.sendFrame({ kind: 'hello', role: this.role, ...(seat ? { seat } : {}) });
  }

  private connect(): void {
    if (this.closed) return;
    let s: WebSocketLike;
    try {
      s = this.factory(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = s;
    s.onopen = () => {
      this.retryMs = this.baseRetryMs;
      this.sendFrame({ kind: 'hello', role: this.role, ...(this.seat ? { seat: this.seat } : {}) });
      this.setUp(true);
    };
    s.onmessage = (ev) => this.receive(ev.data);
    s.onerror = () => {
      /* onclose follows */
    };
    s.onclose = () => {
      if (this.socket === s) this.socket = null;
      this.setUp(false);
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.maxRetryMs, this.retryMs * 2);
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') return;
    let frame: ServerFrame;
    try {
      frame = JSON.parse(data) as ServerFrame;
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object') return;
    this.frameListeners.forEach((l) => l(frame));
    if (frame.kind === 'cabin' && frame.msg) this.cabinListeners.forEach((l) => l(frame.msg));
  }

  private setUp(up: boolean): void {
    if (up === this.up) return;
    this.up = up;
    this.statusListeners.forEach((l) => l(up));
  }
}
