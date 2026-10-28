// Shapes and caps of what the student assistant reads (plan 83, step 2). Everything here
// goes into a model's context, so every list and text is capped, and an exercise is
// described by its title and template only — never its content, keys or answers (R-g).

export const ASSIST_CAPS = {
  lessons: 8,
  lessonChars: 2500,
  rules: 8,
  ruleChars: 3000,
  ruleExamples: 4,
  vocabulary: 60,
  exercises: 30,
  wordMatches: 5,
  wordExamples: 3,
} as const;

export interface AssistLesson {
  id: string;
  title: string;
  text: string;
  truncated: boolean;
}

export interface AssistRuleExample {
  sentence: string;
  /** Compare examples show what not to say too; the flag keeps the model from citing those as correct. */
  correct: boolean;
  note: string | null;
}

export interface AssistGrammarRuleSummary {
  id: string;
  title: string;
  summary: string | null;
  examples: AssistRuleExample[];
}

export interface AssistGrammarRule extends AssistGrammarRuleSummary {
  text: string;
  truncated: boolean;
}

export interface AssistVocabularyEntry {
  id: string;
  word: string;
  partOfSpeech: string | null;
  translation: string | null;
}

export interface AssistExercise {
  id: string;
  title: string | null;
  template: string;
}

export interface AssistUnitMaterial {
  courseId: string;
  unit: { id: string; title: string };
  lessons: AssistLesson[];
  grammarRules: AssistGrammarRuleSummary[];
  vocabulary: AssistVocabularyEntry[];
  exercises: AssistExercise[];
}

export interface AssistWordMatch {
  id: string;
  word: string;
  partOfSpeech: string | null;
  translation: string | null;
  alternatives: string[];
  definition: string | null;
  usageNotes: string | null;
  falseFriendWarning: string | null;
  examples: string[];
}

export interface AssistPersonalWord {
  vocabularyItemId: string;
  word: string;
  surfaceForm: string;
  contextSentence: string | null;
  translation: string | null;
}

export interface AssistWordLookup {
  lemma: string;
  /** Items of the course's published vocabulary lists; empty without a course. */
  course: AssistWordMatch[];
  /** The learner's «My words» (plan 75). */
  personal: AssistPersonalWord[];
}

/**
 * The published variant to read: the asked language, else English, else any — the lowest
 * level first among equals, since the assistant explains rather than teaches at a level.
 */
export function pickVariant<T extends { explanationLanguage: string; minLevel: string }>(
  variants: readonly T[],
  language: string,
): T | null {
  const byLevel = [...variants].sort((a, b) => a.minLevel.localeCompare(b.minLevel));
  return (
    byLevel.find((v) => v.explanationLanguage === language) ??
    byLevel.find((v) => v.explanationLanguage === 'en') ??
    byLevel[0] ??
    null
  );
}

/** At most `max` characters, cut at a word boundary when one is near. */
export function trimText(text: string, max: number): { text: string; truncated: boolean } {
  const clean = text.trim();
  if (clean.length <= max) return { text: clean, truncated: false };
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return { text: (space > max * 0.8 ? cut.slice(0, space) : cut).trimEnd() + ' …', truncated: true };
}
