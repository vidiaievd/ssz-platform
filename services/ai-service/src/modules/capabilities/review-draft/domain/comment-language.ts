const NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

/**
 * The language the remarks are written in, as the prompt names it. The school's setting is
 * a code (`ru`, `uk`) and is spelled out in English; without one, the exercise's own label
 * for the learner's language (`Russisk`) — free text a model reads just as well.
 */
export function commentLanguage(schoolLanguage: string | null, exerciseExplainLabel: string): string {
  if (schoolLanguage) {
    try {
      const name = NAMES.of(schoolLanguage);
      if (name) return name;
    } catch {
      // Not a language tag: use it as written.
      return schoolLanguage;
    }
  }
  return exerciseExplainLabel;
}
