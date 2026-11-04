/** A learner's take of one sentence of a reading, to be heard on its own (plan 86, step 6g). */
export interface SentenceCheckRequest {
  /** The school whose `ai.practice` pays; null — the learner's own plan. */
  schoolId: string | null;
  userId: string;
  /** The reading's exercise, for the ledger only; sentence tries are not counted against it. */
  exerciseId: string | null;
  /** The course language (`nb`). */
  language: string;
  /** The language the sounds are explained in; English when unknown. */
  explanationLanguage: string | null;
  /** The sentence as written, markdown signs already off. */
  sentence: string;
  /** The learner's recording, by media id; its `speech` variant is heard. */
  recordingAssetId: string;
}

export class SentenceCheckCommand {
  constructor(public readonly request: SentenceCheckRequest) {}
}
