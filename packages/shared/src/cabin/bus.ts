import type { CabinMessage } from './protocol';

/**
 * Transport for the cabin network. Every participant receives every message
 * except the ones it posted itself (like a broadcast LAN segment).
 *
 * Implementations:
 *  - LocalBus: in-memory, same JS runtime (used by the simulated crew tablet)
 *  - BroadcastBus: BroadcastChannel, connects browser tabs/iframes on one origin
 *    so the IFE screen, the phone preview and the crew console can talk.
 *
 * MOCK: neither is the real aircraft network. A production adapter would wrap a
 * WebSocket to the crew tablet on the cabin Wi-Fi.
 */
export interface CabinBus {
  post(message: CabinMessage): void;
  subscribe(listener: (message: CabinMessage) => void): () => void;
  close(): void;
}

/** A shared in-memory hub; each `connect()` returns one participant's endpoint. */
export class LocalHub {
  private endpoints = new Set<{ deliver: (m: CabinMessage) => void }>();

  connect(): CabinBus {
    const listeners = new Set<(m: CabinMessage) => void>();
    const endpoint = { deliver: (m: CabinMessage) => listeners.forEach((l) => l(m)) };
    this.endpoints.add(endpoint);
    return {
      post: (message) => {
        // Deliver asynchronously, like a real network.
        const targets = [...this.endpoints].filter((e) => e !== endpoint);
        queueMicrotask(() => targets.forEach((e) => e.deliver(message)));
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close: () => {
        listeners.clear();
        this.endpoints.delete(endpoint);
      },
    };
  }
}

export const BROADCAST_CHANNEL_NAME = 'hearme-cabin-sim-v1';

/** Returns a BroadcastChannel-backed bus, or null where BroadcastChannel is unavailable (e.g. React Native). */
export function createBroadcastBus(channelName = BROADCAST_CHANNEL_NAME): CabinBus | null {
  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (!BC) return null;
  const channel = new BC(channelName);
  const listeners = new Set<(m: CabinMessage) => void>();
  channel.onmessage = (ev: MessageEvent) => listeners.forEach((l) => l(ev.data as CabinMessage));
  return {
    post: (message) => channel.postMessage(message),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      listeners.clear();
      channel.close();
    },
  };
}
