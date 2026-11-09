/** A learner's take of a word to compare with its reference (plan 88, step 8.3) — from the drill that asked for it. */
export interface TonemeCheckRequest {
  /** The school whose `ai.practice` pays; null — the learner's own plan. */
  schoolId: string | null;
  userId: string;
  /** The exercise the take belongs to, for the ledger only (a session's probe, plan 86 step 14.2); null — none. */
  exerciseId: string | null;
  /** The course language (`nb`). */
  language: string;
  /** One word as written; the learner said it in the language's carrier sentence (Q14). */
  word: string;
  /** The learner's recording, by media id; its `speech` variant is what is heard. */
  recordingAssetId: string;
  /** The word's reference clip (media `reference_clip`, step 6b.3). */
  referenceAssetId: string;
  /** A pronunciation session's take (plan 86, step 14.1): its attempt id. Surface `pronunciation_session`, the session's take limit instead of the sentence's; null — not a session. */
  sessionId: string | null;
}

export class CheckTonemeCommand {
  constructor(public readonly request: TonemeCheckRequest) {}
}
