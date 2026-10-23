import type { EngineSubject } from '../../application/ports/review-attempts.client.js';

/** What the teacher made of one offered remark (exercise-engine, plan 79 step 1.5). */
export type RemarkOutcome = 'accepted' | 'edited' | 'discarded' | 'untouched';

/** Where an offered remark pointed — its text is not part of the set. */
export interface OfferedRemark {
  sentenceIndex: number;
  itemId: string;
  aspect: string;
  fragment: string;
}

/**
 * One settled draft as labelled data, as exercise-engine hands it out
 * (`GET /api/v1/internal/ai-review-cases`): the submission beside its key, what a model
 * offered and what the teacher kept. No learner, teacher or school in it.
 */
export interface ReviewCase {
  /** The attempt, for whoever has to look one up. */
  caseId: string;
  decidedAt: string;
  templateCode: string;
  subject: EngineSubject;
  offered: { modelId: string | null; promptVersion: string | null; remarks: OfferedRemark[] };
  outcomes: { remarks: RemarkOutcome[]; summary: RemarkOutcome | null; draftDiscarded: boolean };
  /** The verdict per sentence. */
  decisions: Array<{ itemId: string; approved: boolean }>;
}

export interface ReviewCaseSet {
  cases: ReviewCase[];
  /** Settled drafts the engine left out, by reason. */
  skipped: Record<string, number>;
}
