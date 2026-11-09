/** A learner beginning — or coming back to — a pronunciation session (plan 86, step 14.1). */
export interface AdmitSoundSessionRequest {
  userId: string;
  /** The school whose `ai.practice` pays; null — the learner's own plan. */
  schoolId: string | null;
  /**
   * True — the learner reopens a session already begun: not counted again, and not refused for
   * the day or an empty pool (the session is handed back so it can be handed in); only the budget.
   */
  resume: boolean;
}

export class AdmitSoundSessionCommand {
  constructor(public readonly request: AdmitSoundSessionRequest) {}
}
