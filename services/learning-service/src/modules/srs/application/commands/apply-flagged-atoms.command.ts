import type { ExerciseFeedbackAtomsFlaggedPayload } from '@ssz/contracts';

/** One `exercise.feedback.atoms_flagged` letter, applied to the learner's atom cards (plan 85, step 5). */
export class ApplyFlaggedAtomsCommand {
  constructor(public readonly payload: ExerciseFeedbackAtomsFlaggedPayload) {}
}
