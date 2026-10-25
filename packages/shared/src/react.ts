import { useSyncExternalStore } from 'react';
import type { CrewMode, DemoCabinLink } from './cabin/demo';
import type { PassengerSession, SessionState } from './session/session';
import { getProcessingMode, subscribeProcessingMode } from './cabin/processingMode';

export function useProcessingMode() { return useSyncExternalStore(subscribeProcessingMode, getProcessingMode, () => 'offline' as const); }

/** Subscribe a React component to the shared PassengerSession store. */
export function useSession<T>(session: PassengerSession, select: (s: SessionState) => T): T {
  return useSyncExternalStore(
    session.subscribe,
    () => select(session.getState()),
    () => select(session.getState()),
  );
}

/** Subscribe to any `{ getState, subscribe }`-shaped store (e.g. the simulated CrewTablet). */
export function useExternal<S>(store: { getState(): S; subscribe(l: (s: S) => void): () => void }): S {
  return useSyncExternalStore(
    (cb) => store.subscribe(() => cb()),
    () => store.getState(),
    () => store.getState(),
  );
}

/** Where the passenger link's crew is right now: the hub, a crew console tab, or the in-app simulated crew. */
export function useCrewMode(link: DemoCabinLink): CrewMode {
  return useSyncExternalStore(
    (cb) => {
      const off = link.onChange(cb);
      return () => void off();
    },
    () => link.mode,
    () => link.mode,
  );
}
