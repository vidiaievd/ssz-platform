import type { AttemptAiDraft } from '../entities/attempt-ai-draft.entity.js';

export const ATTEMPT_AI_DRAFT_REPOSITORY = Symbol('IAttemptAiDraftRepository');

export interface IAttemptAiDraftRepository {
  findByAiCallId(aiCallId: string): Promise<AttemptAiDraft | null>;
  findByAttempt(attemptId: string, capability: string): Promise<AttemptAiDraft | null>;
  /** Drafts a verdict has settled, newest decision first — the labelled set (plan 79, 1.6). */
  listDecided(capability: string, limit: number): Promise<AttemptAiDraft[]>;
  /**
   * Inserts or updates. `conflict` when another write took the same `aiCallId` or the same
   * (attempt, capability) slot in between — the caller reads again and answers from that.
   */
  save(draft: AttemptAiDraft): Promise<'saved' | 'conflict'>;
  /**
   * Marks a review disputed by its learner (plan 79, 2.3b), only if nobody did before —
   * `false` when the mark was already there. Separate from `save`: the one column a learner
   * writes should not race the rest of the row.
   */
  markDisputed(id: string, at: Date, reason: string | null): Promise<boolean>;
}
