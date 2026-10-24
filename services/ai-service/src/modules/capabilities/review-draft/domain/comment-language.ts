const NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

/** A language code spelled out in English (`nb` → `Norwegian Bokmål`); free text is kept as written. */
export function languageName(code: string): string {
  try {
    return NAMES.of(code) ?? code;
  } catch {
    // Not a language tag: use it as written.
    return code;
  }
}

/**
 * The language the remarks are written in, as the prompt names it. The school's setting is
 * a code (`ru`, `uk`) and is spelled out in English; without one, the exercise's own label
 * for the learner's language (`Russisk`) — free text a model reads just as well.
 */
export function commentLanguage(schoolLanguage: string | null, exerciseExplainLabel: string): string {
  return schoolLanguage ? languageName(schoolLanguage) : exerciseExplainLabel;
}
