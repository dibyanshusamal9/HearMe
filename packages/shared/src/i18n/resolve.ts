import type { Need, NeedCategory, NeedPurpose } from '../types';
import type { ReplyTemplate } from '../catalog/replies';
import type { LangCode, Localized } from '../types';
import { fallbackLang } from './languages';
import { localePack } from './packs';
import { NEEDS, PURPOSES } from '../catalog/needs';

/**
 * Reading localized text in *any* language HearMe offers.
 *
 * The six core catalogues are complete, so indexing them directly used to be
 * safe. Pack languages are not: they translate the passenger path and fall
 * back for the rest. Everything on screen therefore goes through one of these
 * helpers, which resolve pack → core catalogue → the pack's fallback language
 * → English. Indexing `need.label[lang]` by hand would yield `undefined` for a
 * pack language and render as blank, so prefer these.
 */

/** Core-catalogue text in the best available language. */
export function localized(text: Localized, lang: LangCode): string {
  return text[lang] ?? text[fallbackLang(lang)] ?? text.en;
}

/** What the passenger reads under a picture. */
export function needLabel(need: Need, lang: LangCode): string {
  return localePack(lang)?.needs[need.id] ?? localized(need.label, lang);
}

/** "to take medicine", "for a child" … */
export function purposeLabel(purpose: NeedPurpose, lang: LangCode): string {
  return localePack(lang)?.purposes?.[purpose.id] ?? localized(purpose.label, lang);
}

/** A verified crew reply in the passenger's language. Never machine-translated at runtime. */
export function replyTextOf(reply: ReplyTemplate, lang: LangCode): string {
  return localePack(lang)?.replies[reply.id] ?? localized(reply.text, lang);
}

/** Category heading ("Drinks", "Comfort" …). Packs do not translate these yet, so they fall back. */
export function categoryLabel(labels: Record<NeedCategory, Localized>, category: NeedCategory, lang: LangCode): string {
  return localized(labels[category], lang);
}

/** Need label by id, falling back to the id itself for an unknown need. */
export function needLabelOf(needId: string, lang: LangCode): string {
  const need = NEEDS.find((n) => n.id === needId);
  return need ? needLabel(need, lang) : needId;
}

/** Purpose label by id; empty for no purpose. */
export function purposeLabelOf(purposeId: NeedPurpose['id'] | undefined, lang: LangCode): string {
  const purpose = purposeId ? PURPOSES.find((p) => p.id === purposeId) : undefined;
  return purpose ? purposeLabel(purpose, lang) : '';
}
