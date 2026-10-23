import type { EngineSubject } from '../../application/ports/review-attempts.client.js';

/** What the teacher made of one offered remark (exercise-engine, plan 79 step 1.5). */
export type RemarkOutcome = 'accepted' | 'edited' | 'discarded' | 'untouched';

/** Where an offered remark pointed — its text is not part of the set. */
export interface OfferedRemark {
  sentenceIndex: number;
  itemId: string;
  aspect: string;
  /** Null for a remark about the text as a whole (writing_task `task` / `structure`). */
  fragment: string | null;
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
  /** The verdict per sentence. Empty for a rubric-marked essay. */
  decisions: Array<{ itemId: string; approved: boolean }>;
  /**
   * The marks the teacher gave an essay, by the criterion ids of the subject's rubric — what a
   * candidate's suggested marks are measured against (step 1.7d). Null for other templates;
   * absent from an engine older than 1.7d.
   */
  marks?: Record<string, number> | null;
}

export interface ReviewCaseSet {
  cases: ReviewCase[];
  /** Settled drafts the engine left out, by reason. */
  skipped: Record<string, number>;
}
