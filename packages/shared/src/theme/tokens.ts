/**
 * HearMe design tokens, shared by the React Native app and the web IFE.
 * JAL-inspired palette (crimson, charcoal, white) with accessible semantic colors
 * where needed so text meets WCAG AA (≥ 4.5:1) — contrast is checked in tests.
 */

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  /** Darker primary for text on primarySoft and pressed states. */
  primaryStrong: string;
  navy: string;
  onNavy: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  /** Neutral information (notes, "offered" outcomes); distinct from focus rings. */
  info: string;
  infoSoft: string;
  focus: string;
}

export const lightPalette: Palette = {
  bg: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEFED',
  text: '#242424',
  textMuted: '#626262',
  border: '#D8D8D5',
  primary: '#C8102E',
  onPrimary: '#FFFFFF',
  primarySoft: '#FCECEF',
  primaryStrong: '#A80C26',
  navy: '#242424',
  onNavy: '#FFFFFF',
  success: '#1D6B45',
  successSoft: '#E3F3EA',
  warning: '#7A4E00',
  warningSoft: '#FFF2D6',
  danger: '#A8231A',
  dangerSoft: '#FDE7E5',
  info: '#1A4FAE',
  infoSoft: '#E8F0FE',
  focus: '#1F5FD1',
};

/** High-contrast: black background, white text, yellow accent. */
export const highContrastPalette: Palette = {
  bg: '#000000',
  surface: '#000000',
  surfaceAlt: '#111111',
  text: '#FFFFFF',
  textMuted: '#E6E6E6',
  border: '#FFFFFF',
  primary: '#FFD23F',
  onPrimary: '#000000',
  primarySoft: '#2A2300',
  primaryStrong: '#FFE47D',
  navy: '#000000',
  onNavy: '#FFFFFF',
  success: '#7CFFB2',
  successSoft: '#002611',
  warning: '#FFD23F',
  warningSoft: '#2A2300',
  danger: '#FF9C94',
  dangerSoft: '#2B0300',
  info: '#7CC4FF',
  infoSoft: '#001A33',
  focus: '#7CC4FF',
};

export function palette(highContrast: boolean): Palette {
  return highContrast ? highContrastPalette : lightPalette;
}

/** 4-pt spacing scale. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

/** Minimum touch target sizes (px / dp). Mobile follows platform guidance; IFE is larger for seated, arm's-length use. */
export const touch = { mobileMin: 56, ifeMin: 88 } as const;

/** Base type scale in px/dp; multiply by the user's text scale. */
export const type = {
  mobile: { caption: 14, body: 17, bodyLarge: 19, title: 22, heading: 28, display: 34 },
  ife: { caption: 20, body: 24, bodyLarge: 28, title: 32, heading: 42, display: 56 },
} as const;

export const fontFamily = {
  web: "'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans JP', 'Noto Sans Thai', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export const motion = { fast: 120, base: 200, slow: 320 } as const;

/** WCAG relative-luminance contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
