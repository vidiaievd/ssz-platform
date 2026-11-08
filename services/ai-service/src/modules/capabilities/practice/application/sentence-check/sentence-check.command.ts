import type { SpeechContext } from '../../../../pronunciation/domain/sound-inventory.js';

/** The one sound a pronunciation session judges the take on (plan 86, step 13.3), as the caller names it. */
export interface SentenceCheckTarget {
  /** A scored `sound` atom of the language (`nb:kj`). */
  atomId: string;
  /** The words of the sentence that carry the sound; only they decide the verdict. */
  words: string[];
  /** `word` — a word in its carrier frame («Nå sier jeg kjenne igjen.»); `fluent` — a line of running speech. */
  context: SpeechContext;
  /** `weakest.key`s already explained by the model on this element; the same miss is not explained again. */
  explained: string[];
}

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
  /** A session's take: the sound to judge it on; null — a drill take, heard and remarked on only. */
  target: SentenceCheckTarget | null;
}

export class SentenceCheckCommand {
  constructor(public readonly request: SentenceCheckRequest) {}
}
