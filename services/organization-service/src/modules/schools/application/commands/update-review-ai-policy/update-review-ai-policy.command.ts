import type { ReviewAiMode } from '../../../domain/value-objects/review-ai-policy.vo.js';

/**
 * Who answers the school's work first, set whole: the hours are checked against the
 * escalation only in a mode with a model, so the mode travels with them.
 */
export class UpdateReviewAiPolicyCommand {
  constructor(
    public readonly schoolId: string,
    public readonly actorId: string,
    public readonly mode: ReviewAiMode,
    public readonly autoAcceptAfterHours: number,
    public readonly samplePercent: number,
  ) {}
}
