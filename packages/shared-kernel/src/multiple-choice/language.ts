// The one place in `multiple_choice` where the language of the course matters.
//
// The handoff is written for a Norwegian course read by an English-speaking teacher, and
// two of its rules are language-bound in a way nothing else here is:
//
//   * the distractor audit flags absolute wording — «alltid», «aldri», «bare» — because
//     an absolute reads as wrong on sight, so it is a giveaway rather than a distractor;
//   * it flags «alle/ingen av svarene», which tests logic instead of the language point.
//
// Both lists are Norwegian (plus three English words that slipped into the same regex).
// The platform is not: courses are authored in whatever language a school teaches, and
// plan 53 §3.6 makes the rule follow the course rather than the handoff. A pack is chosen
// by the course language; **when no pack matches, the checks stay silent** rather than
// hunting for Norwegian words in Ukrainian text. Both flags are `info` level, so a false
// positive costs more than a missed one — it teaches the author to ignore the audit.
//
// Word boundaries are written as lookarounds over `\p{L}` rather than `\b`. `\b` is
// ASCII-based: between a space and «в» there is no boundary at all, so a `\b`-anchored
// Cyrillic pattern silently matches nothing.

export interface LanguagePack {
  /** ISO 639-1 codes this pack answers for. */
  langs: readonly string[];
  /** Absolute wording — a distractor that says it is visibly the wrong one. */
  absolutes: RegExp;
  /** "All / none of the answers" — an option that tests logic, not the language. */
  allOfThese: RegExp;
}

const word = (alternatives: readonly string[]): RegExp =>
  new RegExp(`(?<!\\p{L})(?:${alternatives.join('|')})(?!\\p{L})`, 'iu');

export const PACKS: readonly LanguagePack[] = [
  {
    langs: ['nb', 'nn', 'no'],
    absolutes: word(['alltid', 'aldri', 'alle', 'ingen', 'bare', 'kun']),
    allOfThese: /^(alle|ingen)\s+av\s+(svarene|alternativene)/iu,
  },
  {
    langs: ['en'],
    absolutes: word(['always', 'never', 'all', 'none', 'only', 'must']),
    allOfThese: /^(all|none)\s+of\s+(the\s+)?(above|these|answers)/iu,
  },
  {
    langs: ['ru'],
    absolutes: word(['всегда', 'никогда', 'все', 'всё', 'никто', 'ничто', 'только', 'лишь']),
    allOfThese: /^(все|ни\s+один|ничего)\s+из\s+(перечисленного|ответов|вариантов)/iu,
  },
  {
    langs: ['uk'],
    absolutes: word(['завжди', 'ніколи', 'всі', 'усі', 'ніхто', 'ніщо', 'тільки', 'лише']),
    allOfThese: /^(всі|усі|жоден|нічого)\s+(з|із)\s+(переліченого|відповідей|варіантів)/iu,
  },
  {
    langs: ['de'],
    absolutes: word(['immer', 'nie', 'niemals', 'alle', 'keine', 'nur']),
    allOfThese: /^(alle|keine)\s+(der\s+)?(obigen|antworten)/iu,
  },
];

/** The pack for a course language, or `null` when the platform has none for it. */
export function packFor(language: string | undefined): LanguagePack | null {
  const code = (language ?? '').trim().toLowerCase().split('-')[0] ?? '';
  if (code === '') return null;
  return PACKS.find((p) => p.langs.includes(code)) ?? null;
}

/**
 * Compare two option texts for "these say the same thing".
 *
 * The handoff uses `toLowerCase()`. That is wrong in three of the languages the platform
 * already ships an interface in and in every language written with a case mapping of its
 * own: Turkish `İ`, German `ß`, and any text that arrives decomposed rather than composed
 * (NFC) compares unequal to the identical string typed on another keyboard.
 */
export function normalizeText(text: string, language?: string): string {
  const locale = (language ?? '').trim();
  const collapsed = text.trim().replace(/\s+/gu, ' ').normalize('NFC');
  return locale === '' ? collapsed.toLocaleLowerCase() : collapsed.toLocaleLowerCase(locale);
}
