import { readFileSync } from 'node:fs';
import { isSeat, type LangCode, type PassengerProfile, type ProfileTag } from '@hearme/shared';

/**
 * "Language and needs travel with the booking": the hub gets the flight's
 * passenger list before departure. In production this comes from the
 * airline's departure control system (PNR SSR/OSI codes such as WCHR, DEAF,
 * DIAB); here it is a sample file, `data/manifest.json`.
 */
interface ManifestEntry {
  seat: string;
  lang: LangCode;
  /** Language-pack language the passenger speaks, when there are no screens in it yet. */
  speechLang?: string;
  name?: string;
  tags: ProfileTag[];
  ssr?: string[];
}

const manifest: ManifestEntry[] = (
  JSON.parse(readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8')) as { passengers: ManifestEntry[] }
).passengers;

export function lookupBooking(seat: string): PassengerProfile | null {
  if (!isSeat(seat)) return null;
  const e = manifest.find((p) => p.seat === seat);
  if (!e) return null;
  return { lang: e.lang, seat: e.seat, name: e.name, tags: e.tags, shareTagsWithCrew: true, ...(e.speechLang ? { speechLang: e.speechLang } : {}) };
}

export function manifestSeats(): string[] {
  return manifest.map((p) => p.seat);
}
