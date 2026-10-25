import type { LangCode } from '../types';

/** Bulbul v3's ten Indian languages plus English; original screens keep their own list. */
export const ONLINE_LANGUAGE_CODES = ['hi', 'en', 'bn', 'ta', 'pa', 'mr', 'gu', 'kn', 'ml', 'or', 'te'] as const satisfies readonly LangCode[];
export type OnlineLangCode = typeof ONLINE_LANGUAGE_CODES[number];
export function isOnlineLangCode(value: unknown): value is OnlineLangCode {
  return typeof value === 'string' && (ONLINE_LANGUAGE_CODES as readonly string[]).includes(value);
}
