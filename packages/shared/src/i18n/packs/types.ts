import type { LangCode, ReplyId } from '../../types';
import type { StringKey } from '../strings';

/**
 * A language pack: one data file that carries a language all the way through
 * HearMe — the words to recognise a request by, the screens the passenger
 * reads, and the verified replies the crew send back.
 *
 * Nothing here is code. Adding a language means adding one of these files and
 * one row in `i18n/languages.ts`; the matcher, the apps and the crew console
 * pick it up without changes. What a pack leaves out falls back to the core
 * language named in that row, so a half-finished pack degrades visibly rather
 * than showing blanks.
 *
 * Type-only imports keep this file free of runtime dependencies, so packs can
 * be loaded by `strings.ts` without an import cycle.
 */
export interface LocalePack {
  code: LangCode;

  /** Interface strings. `PASSENGER_PATH_KEYS` is the set a pack must cover (a test enforces it). */
  ui: Partial<Record<StringKey, string>>;

  /** Need labels, by need id: what the passenger reads under each picture. */
  needs: Record<string, string>;

  /** Purpose labels ("to take medicine"), by purpose id. */
  purposes?: Record<string, string>;

  /**
   * Verified crew replies, by reply id. These are the only words a crew member
   * can send: pre-written and reviewable, never machine-translated at runtime.
   */
  replies: Partial<Record<ReplyId, string>>;

  /** Matching vocabulary per need id: strong matches, merged into `Need.phrases`. */
  phrases: Record<string, string[]>;

  /** Weaker matching vocabulary per need id, merged into `Need.hints`. */
  hints?: Record<string, string[]>;

  /** Whole example requests per need id: used to train the classifier and to evaluate. */
  examples?: Record<string, string[]>;

  /** Request templates for generating training data; `{k}` is replaced by each keyword. */
  templates?: string[];

  /**
   * Where the wording came from, in the pack's own words. Shown in the
   * coverage report so nobody mistakes a draft for reviewed copy.
   */
  provenance: string;
}
