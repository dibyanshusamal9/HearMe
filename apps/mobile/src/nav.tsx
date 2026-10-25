import type { MatchEvidence, NeedCategory, NeedPurpose, RequestSource, Understanding } from '@hearme/shared';
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
  /** `draft`: start from text the passenger can correct rather than retype (after a misheard request). */
  | { kind: 'typed'; draft?: string }
  | {
      kind: 'ask';
      options: string[];
      purposeId?: NeedPurpose['id'];
      source: RequestSource;
      transcript: string;
      confidence: number;
      /** Why HearMe is asking: shown to the passenger in words. */
      evidence?: MatchEvidence;
      /** The catalogue word it recognised, if any. */
      matchedWord?: string;
    }
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
