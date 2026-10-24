import type { AiDraftCapability } from '../../../domain/entities/attempt-ai-draft.entity.js';

/** The draft the reviewer's screen shows beside one submission (plan 79, step 1.4). */
export class GetDraftForReviewQuery {
  constructor(
    readonly attemptId: string,
    readonly capability: AiDraftCapability,
  ) {}
}
