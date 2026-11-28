/**
 * The articulation base of one sound family as content-service keeps it (plan 86, steps 9.1–9.2,
 * Q18 = A): what the learner reads on the card of the sound, and what the explanation agent
 * quotes. The inventory (`nb-sounds.data.ts`) stays what measures; this is what teaches.
 */
export interface SoundBaseEntry {
  /** The inventory's family (`kj`, `vowel_length`) — what a remark is filed under. */
  family: string;
  /** The locale the texts are in: the one asked for, or `en` when it has none. */
  locale: string;
  title: string;
  description: string | null;
  howTo: string | null;
  /** The usual mistake of speakers of Russian and Ukrainian; null when not offered to this learner. */
  commonError: string | null;
  /** Where Ukrainian speakers differ; null when it does not, or not offered to this learner. */
  ukNote: string | null;
  drill: string | null;
  carrierWords: string[];
}

/** By family. Empty when the base could not be read — the inventory's notes are all there is. */
export type SoundBase = ReadonlyMap<string, SoundBaseEntry>;

export const EMPTY_SOUND_BASE: SoundBase = new Map();

/**
 * What the learner reads when the model did not explain (off, refused, failed): the base's «how to
 * say it» in the learner's own language, beside the sound's title (OPEN-QUESTIONS П-10, live check
 * 28.11 — a Ukrainian reader got the inventory's English notes whenever Gemini was overloaded, and
 * always on hand-in while `voice_review_explain` is unbound). Only an entry written in the locale
 * asked for counts: one that fell back to English is no better than the inventory's own English
 * note, which stays. Null when no remark gains a line; the summary is left to the caller.
 */
export function explanationsFromBase(
  sounds: readonly { family: string }[],
  base: SoundBase,
  explanationLocale: string,
): { explanations: string[]; summary: string } | null {
  const locale = explanationLocale.toLowerCase();
  if (locale === 'en') return null;
  const explanations = new Array<string>(sounds.length);
  let any = false;
  sounds.forEach((sound, i) => {
    const entry = base.get(sound.family);
    if (!entry || entry.locale.toLowerCase() !== locale) return;
    const how = oneLine(entry.howTo) ?? oneLine(entry.description);
    if (how === null) return;
    explanations[i] = `${oneLine(entry.title) ?? sound.family}: ${how}`;
    any = true;
  });
  return any ? { explanations, summary: '' } : null;
}

function oneLine(text: string | null): string | null {
  const line = (text ?? '').replace(/\s+/g, ' ').trim();
  return line === '' ? null : line;
}

/** Locales whose speakers the base's `commonError` is written for (§4y.1, Q18). */
const COMMON_ERROR_LOCALES: ReadonlySet<string> = new Set(['ru', 'uk']);

/**
 * The base as one learner is told it, by the language they read explanations in — the only hint
 * of their first language ai-service has. The common error of a Russian or Ukrainian speaker is
 * offered to those reading Russian or Ukrainian; the Ukrainian note, only to those reading
 * Ukrainian. Anyone else gets how to make the sound, not a warning about someone else's mistake.
 */
export function soundBaseFor(entries: readonly SoundBaseEntry[], explanationLocale: string): SoundBase {
  const locale = explanationLocale.toLowerCase();
  const base = new Map<string, SoundBaseEntry>();
  for (const entry of entries) {
    base.set(entry.family, {
      ...entry,
      commonError: COMMON_ERROR_LOCALES.has(locale) ? entry.commonError : null,
      ukNote: locale === 'uk' ? entry.ukNote : null,
    });
  }
  return base;
}
