import { palette, radius, space, touch, type as typeScale, type Palette } from '@hearme/shared';
import { useSession } from '@hearme/shared/react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { session } from './runtime';

export interface Theme {
  p: Palette;
  /** Scaled font size for a base size. OS font scaling is applied on top (capped per Text). */
  fs: (base: number) => number;
  scale: number;
  reduceMotion: boolean;
  hc: boolean;
  space: typeof space;
  radius: typeof radius;
  t: typeof typeScale.mobile;
  minTouch: number;
}

const Ctx = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const prefs = useSession(session, (s) => s.prefs);
  const value = useMemo<Theme>(
    () => ({
      p: palette(prefs.highContrast),
      fs: (base) => Math.round(base * prefs.textScale),
      scale: prefs.textScale,
      reduceMotion: prefs.reduceMotion,
      hc: prefs.highContrast,
      space,
      radius,
      t: typeScale.mobile,
      minTouch: touch.mobileMin,
    }),
    [prefs.highContrast, prefs.textScale, prefs.reduceMotion],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): Theme {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}

