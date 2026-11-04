import type { Result } from '../../../../shared/kernel/result.js';
import type { ExerciseScope } from '../prosody-owner.js';
import type { ProsodyError } from '../prosody-error.js';

export const PROSODY_TEXT_READER = Symbol('PROSODY_TEXT_READER');

/** A TEXT variant's body and the language it is written in — what the lexicon is chosen by. */
export interface LessonBody {
  text: string;
  /** The lesson's `target_language` (`nb`). */
  language: string;
  /** The school that owns the lesson, whose `ai.authoring` pays for a suggestion; null — none. */
  ownerSchoolId: string | null;
}

export interface ReadAloudPassages {
  /** The exercise's `target_language` (`nb`). */
  language: string;
  /** The school that owns the exercise; null — none. */
  ownerSchoolId: string | null;
  /** `read`, `monologue` or `dialogue`; null when the document has none yet. */
  mode: string | null;
  /** Every prompt, in document order; `text` is '' when the prompt has no passage. */
  prompts: { id: string; text: string }[];
}

/** The texts a layer is drawn under, read where they live — the lesson and exercise tables. */
export interface IProsodyTextReader {
  /** The body markdown of a TEXT variant of this lesson. */
  lessonBody(lessonId: string, variantId: string): Promise<Result<LessonBody, ProsodyError>>;
  readAloudPassages(
    exerciseId: string,
    scope: ExerciseScope,
  ): Promise<Result<ReadAloudPassages, ProsodyError>>;
}
