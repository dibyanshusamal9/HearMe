import type { LinkStatus } from '../types';
import { createBroadcastBus, LocalHub, type CabinBus } from './bus';
import { CrewTablet } from './crewTablet';
import { hubSocketUrl } from './hubProtocol';
import { SimulatedCabinLink, type CabinLink, type NetworkCondition } from './link';
import type { CrewToPassenger, PassengerToCrew } from './protocol';
import { WebSocketBus, type WebSocketFactory } from './ws';

const CREW_PRESENCE_CHANNEL = 'hearme-crew-presence-v1';
const CREW_PRESENCE_INTERVAL_MS = 2000;
const CREW_PRESENCE_TIMEOUT_MS = 6000;

/**
 * A crew console tab without a hub: tell passenger tabs in this browser that a
 * real crew screen is open (see `DemoCabinLink.watchForConsole`).
 */
export function announceCrewConsole(): () => void {
  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (!BC) return () => undefined;
  const channel = new BC(CREW_PRESENCE_CHANNEL);
  channel.onmessage = (ev: MessageEvent) => ev.data === 'who' && channel.postMessage('here');
  channel.postMessage('here');
  const beat = setInterval(() => channel.postMessage('here'), CREW_PRESENCE_INTERVAL_MS);
  return () => {
    clearInterval(beat);
    channel.close();
  };
}

/**
 * The passenger device's connection to the crew tablet. Its far end is:
 *  - 'hub':       the real cabin hub (`apps/hub`) over a WebSocket. Phones,
 *                 seatback screens and crew consoles on any device share it.
 *  - 'simulated': an auto-replying CrewTablet inside this app (no hub needed).
 *  - 'console':   a crew console tab in the same browser (BroadcastChannel).
 * In every mode a presenter can additionally simulate an unstable or missing
 * cabin network on top of the real connection state.
 */
export type CrewMode = 'hub' | 'simulated' | 'console';

export interface DemoLinkOptions {
  /** Base URL of the cabin hub, e.g. `https://192.168.1.20:8443`. */
  hubUrl?: string | null;
  wsFactory?: WebSocketFactory;
}

export class DemoCabinLink implements CabinLink {
  private inner!: SimulatedCabinLink;
  private bus!: CabinBus;
  private crewBus?: CabinBus;
  private crew: CrewTablet | null = null;
  private hubBus: WebSocketBus | null = null;
  private innerUnsubs: (() => void)[] = [];
  private statusListeners = new Set<(s: LinkStatus) => void>();
  private messageListeners = new Set<(m: CrewToPassenger) => void>();
  private condition: NetworkCondition = 'good';
  private modeValue: CrewMode = 'simulated';
  private changeListeners = new Set<() => void>();
  private hub: string | null;
  private seat: string | undefined;
  private readonly wsFactory?: WebSocketFactory;
  /** A presenter picked the mode by hand: stop following crew console tabs. */
  private manualMode = false;

  constructor(mode: CrewMode = 'simulated', options: DemoLinkOptions = {}) {
    this.hub = options.hubUrl ?? null;
    this.wsFactory = options.wsFactory;
    this.build(mode);
  }

  /** True unless connected through the real cabin hub. */
  get simulated(): boolean {
    return this.modeValue !== 'hub';
  }

  get mode(): CrewMode {
    return this.modeValue;
  }

  get networkCondition(): NetworkCondition {
    return this.condition;
  }

  get hubUrl(): string | null {
    return this.hub;
  }

  /** True when this runtime can reach a crew console tab (BroadcastChannel available). */
  static consoleSupported(): boolean {
    return typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel === 'function';
  }

  /** True when this runtime can open a WebSocket to a cabin hub. */
  static hubSupported(): boolean {
    return typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function';
  }

  /** The in-app simulated crew tablet (only in 'simulated' mode). */
  get simulatedCrew(): CrewTablet | null {
    return this.crew;
  }

  setMode(mode: CrewMode): void {
    this.manualMode = true;
    this.switchMode(mode);
  }

  /**
   * Without a hub, follow crew console tabs in this browser: switch to 'console'
   * while one announces itself, and back to the in-app simulated crew when it
   * closes. A mode picked with `setMode` (prototype controls) always wins.
   */
  watchForConsole(): () => void {
    const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
    if (!BC) return () => undefined;
    const channel = new BC(CREW_PRESENCE_CHANNEL);
    let lastSeen = 0;
    channel.onmessage = (ev: MessageEvent) => {
      if (ev.data !== 'here') return;
      lastSeen = Date.now();
      if (!this.manualMode && this.modeValue === 'simulated') this.switchMode('console');
    };
    channel.postMessage('who');
    const check = setInterval(() => {
      if (!this.manualMode && this.modeValue === 'console' && Date.now() - lastSeen > CREW_PRESENCE_TIMEOUT_MS) this.switchMode('simulated');
    }, CREW_PRESENCE_INTERVAL_MS);
    return () => {
      clearInterval(check);
      channel.close();
    };
  }

  private switchMode(mode: CrewMode): void {
    if (mode === this.modeValue) return;
    this.teardown();
    this.build(mode);
    this.emitStatus();
    this.changeListeners.forEach((l) => l());
  }

  /** Point the link at a (different) hub. Switches to 'hub' mode when a URL is given. */
  setHubUrl(url: string | null): void {
    this.hub = url;
    this.teardown();
    this.build(url ? 'hub' : this.modeValue === 'hub' ? 'simulated' : this.modeValue);
    this.emitStatus();
    this.changeListeners.forEach((l) => l());
  }

  setCondition(condition: NetworkCondition): void {
    this.condition = condition;
    this.inner.setCondition(condition);
    this.changeListeners.forEach((l) => l());
  }

  /** The hub only sends a passenger device the replies for its own seat. */
  setSeat(seat: string | undefined): void {
    this.seat = seat;
    this.hubBus?.setSeat(seat);
  }

  /** Notified when mode, hub or condition changes (for demo-control UIs). */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  getStatus(): LinkStatus {
    return this.inner.getStatus();
  }

  onStatus(listener: (s: LinkStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onMessage(listener: (m: CrewToPassenger) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  send(message: PassengerToCrew): boolean {
    return this.inner.send(message);
  }

  dispose(): void {
    this.teardown();
    this.statusListeners.clear();
    this.messageListeners.clear();
    this.changeListeners.clear();
  }

  private build(mode: CrewMode): void {
    let transport: WebSocketBus | undefined;
    if (mode === 'hub' && this.hub && (this.wsFactory || DemoCabinLink.hubSupported())) {
      this.modeValue = 'hub';
      transport = new WebSocketBus(hubSocketUrl(this.hub), { role: 'passenger', seat: this.seat, factory: this.wsFactory });
      this.hubBus = transport;
      this.bus = transport;
    } else {
      const broadcast = mode === 'console' ? createBroadcastBus() : null;
      if (broadcast) {
        this.modeValue = 'console';
        this.bus = broadcast;
      } else {
        this.modeValue = 'simulated';
        const hub = new LocalHub();
        this.bus = hub.connect();
        this.crewBus = hub.connect();
        this.crew = new CrewTablet(this.crewBus, { autoReply: true });
      }
    }
    this.inner = new SimulatedCabinLink(this.bus, { condition: this.condition, transport });
    this.innerUnsubs = [
      this.inner.onStatus(() => this.emitStatus()),
      this.inner.onMessage((m) => this.messageListeners.forEach((l) => l(m))),
    ];
  }

  private emitStatus(): void {
    const s = this.inner.getStatus();
    this.statusListeners.forEach((l) => l(s));
  }

  private teardown(): void {
    this.innerUnsubs.forEach((u) => u());
    this.inner.dispose();
    this.bus.close();
    this.crew?.dispose();
    this.crewBus?.close();
    this.crew = null;
    this.crewBus = undefined;
    this.hubBus = null;
  }
}
