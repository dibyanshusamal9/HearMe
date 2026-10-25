import { palette, radius, type Palette } from '@hearme/shared';
import type { CSSProperties } from 'react';

/** Expose shared design tokens as CSS custom properties on an app root. */
export function themeVars(highContrast: boolean, textScale = 1): CSSProperties {
  const p: Palette = palette(highContrast);
  const vars: Record<string, string> = { '--scale': String(textScale) };
  for (const [k, v] of Object.entries(p)) vars[`--c-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`] = v;
  for (const [k, v] of Object.entries(radius)) vars[`--r-${k}`] = `${v}px`;
  return vars as CSSProperties;
}
