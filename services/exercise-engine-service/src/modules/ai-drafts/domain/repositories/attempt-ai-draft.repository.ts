import type { AttemptAiDraft } from '../entities/attempt-ai-draft.entity.js';

export const ATTEMPT_AI_DRAFT_REPOSITORY = Symbol('IAttemptAiDraftRepository');

export interface IAttemptAiDraftRepository {
  findByAiCallId(aiCallId: string): Promise<AttemptAiDraft | null>;
  findByAttempt(attemptId: string, capability: string): Promise<AttemptAiDraft | null>;
  /**
   * Inserts or updates. `conflict` when another write took the same `aiCallId` or the same
   * (attempt, capability) slot in between — the caller reads again and answers from that.
   */
  save(draft: AttemptAiDraft): Promise<'saved' | 'conflict'>;
}
