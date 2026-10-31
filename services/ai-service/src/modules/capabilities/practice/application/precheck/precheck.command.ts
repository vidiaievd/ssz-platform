import type { EngineSubject } from '../../../review-draft/application/ports/review-attempts.client.js';
import type { ReadAloudSubject } from '../../../voice-review/domain/read-aloud-subject.js';

/** Work in progress as exercise-engine reads it — the same subjects it builds for the review queue. */
export type PracticeSubject = EngineSubject | ReadAloudSubject;

/** A school's learner asks for a check of an attempt still in progress (plan 84, step 2). */
export interface PrecheckRequest {
  schoolId: string;
  userId: string;
  exerciseId: string;
  attemptId: string;
  subject: PracticeSubject;
}

export class PrecheckCommand {
  constructor(public readonly request: PrecheckRequest) {}
}
