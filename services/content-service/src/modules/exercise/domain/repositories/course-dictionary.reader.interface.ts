export const COURSE_DICTIONARY_READER = Symbol('COURSE_DICTIONARY_READER');

/** Parts of speech an inflection table can be built over — the paradigms of the packs. */
export type DictionaryPartOfSpeech = 'NOUN' | 'VERB' | 'ADJECTIVE';

export const DICTIONARY_PARTS_OF_SPEECH: readonly DictionaryPartOfSpeech[] = [
  'NOUN',
  'VERB',
  'ADJECTIVE',
];

/**
 * One word of the course dictionary — structurally the kernel's `DictionaryEntry`
 * (`@ssz/shared-kernel/inflection-table`), which spells the row's forms from it.
 */
export interface CourseDictionaryEntry {
  /** `vocabulary_items.id` — becomes the row's `dictId`. */
  id: string;
  word: string;
  /** `PartOfSpeech` enum *name* (`NOUN`), as Prisma returns it. */
  pos: string;
  /** Meaning in the requested language, else English, else the first translation; may be empty. */
  gloss: string;
  /** Where in the course the word is introduced: the module, behind its course section if any. */
  unit: string;
  /** `grammaticalProperties` as stored — `gender`, `definite_singular`, `past_tense`, … */
  properties: Record<string, unknown>;
}

export interface CourseDictionaryOptions {
  pos?: DictionaryPartOfSpeech;
  glossLanguage?: string;
}

/**
 * The course dictionary of an exercise (plan 69 §3.8): every word of every vocabulary list the
 * exercise's course carries — in its modules and directly — read from the draft of each container,
 * falling back to its published version, because the author is editing the draft.
 */
export interface ICourseDictionaryReader {
  forExercise(
    exerciseId: string,
    options: CourseDictionaryOptions,
  ): Promise<CourseDictionaryEntry[]>;
}
