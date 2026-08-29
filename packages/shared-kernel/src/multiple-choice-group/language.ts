// The one place in `multiple_choice_group` where the language of the course matters.
//
// The statement audit flags absolute wording — «alltid», «aldri», «alle», «bare» — because
// on a Riktig/Galt table an absolute is not a hard statement, it is a tell: students learn
// that the sweeping one is the false one and stop reading the text. The handoff's list is
// Norwegian; the platform is not (plan 53 §3.6, carried here unchanged). A pack is chosen
// by the course language, and **when no pack matches the check stays silent** rather than
// hunting for Norwegian words in Ukrainian text. The flag is `info` level, so a false
// positive costs more than a missed one: it teaches the author to ignore the audit.
//
// `negation` is the second language-bound check and has no counterpart in
// `multiple_choice`: two negations in one statement («Det er ikke sant at han ikke kom»)
// make a Riktig/Galt row a logic puzzle rather than a comprehension question. It needs the
// language for the obvious reason — «ikke» is a Norwegian word.
//
// Word boundaries are lookarounds over `\p{L}` rather than `\b`. `\b` is ASCII-based:
// between a space and «в» there is no boundary at all, so a `\b`-anchored Cyrillic pattern
// silently matches nothing.

export interface LanguagePack {
  /** ISO 639-1 codes this pack answers for. */
  langs: readonly string[];
  /** Absolute wording — reads as false on sight. */
  absolutes: RegExp;
  /** The negation particle, counted per statement. */
  negation: RegExp;
  /** Affirmative answers, for the "this is a question, not a statement" check. */
  affirmative: RegExp;
}

const word = (alternatives: readonly string[]): RegExp =>
  new RegExp(`(?<!\\p{L})(?:${alternatives.join('|')})(?!\\p{L})`, 'iu');

const wordGlobal = (alternatives: readonly string[]): RegExp =>
  new RegExp(`(?<!\\p{L})(?:${alternatives.join('|')})(?!\\p{L})`, 'giu');

export const PACKS: readonly LanguagePack[] = [
  {
    langs: ['nb', 'nn', 'no'],
    absolutes: word(['alltid', 'aldri', 'alle', 'ingen', 'bare', 'kun', 'enhver', 'samtlige']),
    negation: wordGlobal(['ikke', 'aldri']),
    affirmative: word(['ja', 'nei']),
  },
  {
    langs: ['en'],
    absolutes: word(['always', 'never', 'all', 'none', 'only', 'every', 'everyone']),
    negation: wordGlobal(['not', "n't", 'never']),
    affirmative: word(['yes', 'no']),
  },
  {
    langs: ['ru'],
    absolutes: word(['всегда', 'никогда', 'все', 'никто', 'только', 'каждый', 'любой']),
    negation: wordGlobal(['не', 'ни']),
    affirmative: word(['да', 'нет']),
  },
  {
    langs: ['uk'],
    absolutes: word(['завжди', 'ніколи', 'всі', 'ніхто', 'тільки', 'лише', 'кожен', 'будь-який']),
    negation: wordGlobal(['не', 'ні']),
    affirmative: word(['так', 'ні']),
  },
];

/** The pack for a course language, or `null` — which means the checks stay silent. */
export function packFor(language: string | undefined): LanguagePack | null {
  if (language === undefined) return null;
  const code = language.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return PACKS.find((pack) => pack.langs.includes(code)) ?? null;
}

/** How many negations one statement carries. Two is the flag. */
export function countNegations(text: string, pack: LanguagePack): number {
  return text.match(pack.negation)?.length ?? 0;
}

/**
 * Comparison form for "two statements say the same thing".
 *
 * Case, whitespace and trailing punctuation only — never a language's own normalisation.
 * Two statements differing by an accent are two statements.
 */
export function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?;:]+$/u, '');
}
