import type { ReviewEscalationTarget } from '../../../domain/value-objects/review-settings.vo.js';

/**
 * A school's new promise about answering work.
 *
 * All three values together, never one at a time: the two durations constrain each other,
 * and a patch of one of them would have to be validated against a value it cannot see.
 */
export class UpdateReviewSettingsCommand {
  constructor(
    public readonly schoolId: string,
    public readonly actorId: string,
    public readonly respondWithinHours: number,
    public readonly escalateAfterHours: number,
    public readonly escalateTo: ReviewEscalationTarget,
  ) {}
}
