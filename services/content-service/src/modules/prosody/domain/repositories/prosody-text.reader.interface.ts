import type { Result } from '../../../../shared/kernel/result.js';
import type { ExerciseScope } from '../prosody-owner.js';
import type { ProsodyError } from '../prosody-error.js';

export const PROSODY_TEXT_READER = Symbol('PROSODY_TEXT_READER');

export interface ReadAloudPassages {
  /** `read`, `monologue` or `dialogue`; null when the document has none yet. */
  mode: string | null;
  /** Every prompt, in document order; `text` is '' when the prompt has no passage. */
  prompts: { id: string; text: string }[];
}

/** The texts a layer is drawn under, read where they live — the lesson and exercise tables. */
export interface IProsodyTextReader {
  /** The body markdown of a TEXT variant of this lesson. */
  lessonBody(lessonId: string, variantId: string): Promise<Result<string, ProsodyError>>;
  readAloudPassages(
    exerciseId: string,
    scope: ExerciseScope,
  ): Promise<Result<ReadAloudPassages, ProsodyError>>;
}
