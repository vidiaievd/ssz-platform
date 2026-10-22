import type { AiDraftCapability } from '../../../domain/entities/attempt-ai-draft.entity.js';
import type { ReviewerOutcomes } from '../../../domain/draft-outcomes.js';

/** A verdict landed on an attempt with a draft the reviewer was shown (plan 79, 1.5). */
export class SettleAiDraftCommand {
  constructor(
    readonly attemptId: string,
    readonly capability: AiDraftCapability,
    readonly outcomes: ReviewerOutcomes,
  ) {}
}
