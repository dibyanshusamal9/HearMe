import type { NeedCategory, NeedPurpose, RequestSource, Understanding } from '@hearme/shared';
import { createContext, useContext } from 'react';

export type Tab = 'home' | 'requests' | 'card' | 'flight' | 'settings';

export type Overlay =
  | { kind: 'review'; needId: string; purposeId?: NeedPurpose['id']; source: RequestSource; understanding?: Understanding }
  | {
      kind: 'reviewMany';
      items: { needId: string; purposeId?: NeedPurpose['id']; confidence: number }[];
      refused: string[];
      source: RequestSource;
      transcript: string;
    }
  | { kind: 'picker'; category: NeedCategory }
  | { kind: 'speech' }
  | { kind: 'typed' }
  | { kind: 'ask'; options: string[]; purposeId?: NeedPurpose['id']; source: RequestSource; transcript: string; confidence: number }
  | { kind: 'showCard'; needId: string }
  | { kind: 'care' };

export interface Nav {
  tab: Tab;
  setTab: (t: Tab) => void;
  overlay: Overlay | null;
  open: (o: Overlay) => void;
  close: () => void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const v = useContext(NavContext);
  if (!v) throw new Error('useNav outside NavContext');
  return v;
}
