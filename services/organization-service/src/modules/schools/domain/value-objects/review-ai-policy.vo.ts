import { InvalidReviewSettingsException } from '../exceptions/invalid-review-settings.exception.js';

/**
 * Who answers a learner's work first (plan 80, R1):
 *  - `teacher_only` — the teacher, as before plan 80;
 *  - `ai_then_teacher` — a model answers at once, its verdict provisional; the teacher
 *    confirms or overrides it, and if nobody has after `autoAcceptAfterHours` the model's
 *    verdict counts;
 *  - `ai_with_sampling` — a model answers and its verdict counts at once, except for the
 *    work sent to the teacher: a failed verdict, a disagreement with the machine check, and
 *    a random `samplePercent` of the rest.
 *
 * Member names, not a mapping of them — see `ReviewEscalationTarget`.
 */
export const ReviewAiMode = {
  TEACHER_ONLY: 'teacher_only',
  AI_THEN_TEACHER: 'ai_then_teacher',
  AI_WITH_SAMPLING: 'ai_with_sampling',
} as const;

export type ReviewAiMode = (typeof ReviewAiMode)[keyof typeof ReviewAiMode];

/** The subscription feature key a school needs for either mode with a model (plan 80, R7). */
export const REVIEW_AI_POLICY_FEATURE_KEY = 'school.review_ai_policy';

/** A month, the same ceiling as the response promise. */
const MAX_HOURS = 720;

/**
 * How a school uses a model to answer work, beside `ReviewSettings` (the promise of a
 * person's answer). Kept apart from it because it is sold separately: the promise is every
 * school's, the modes with a model are a feature of the plan.
 *
 * The hours and the share are kept whatever the mode, so a school that turns the model off
 * and on again finds its numbers where it left them.
 */
export class ReviewAiPolicy {
  /** A week (plan 80 §3): long enough for a teacher who looks weekly, short enough for SRS. */
  static readonly DEFAULT_AUTO_ACCEPT_AFTER_HOURS = 168;
  static readonly DEFAULT_SAMPLE_PERCENT = 15;

  private constructor(
    readonly mode: ReviewAiMode,
    readonly autoAcceptAfterHours: number,
    readonly samplePercent: number,
  ) {}

  static default(): ReviewAiPolicy {
    return new ReviewAiPolicy(
      ReviewAiMode.TEACHER_ONLY,
      ReviewAiPolicy.DEFAULT_AUTO_ACCEPT_AFTER_HOURS,
      ReviewAiPolicy.DEFAULT_SAMPLE_PERCENT,
    );
  }

  static create(props: {
    mode: ReviewAiMode;
    autoAcceptAfterHours: number;
    samplePercent: number;
  }): ReviewAiPolicy {
    if (!Object.values(ReviewAiMode).includes(props.mode)) {
      throw new InvalidReviewSettingsException(`Unknown review mode "${String(props.mode)}"`);
    }
    if (
      !Number.isInteger(props.autoAcceptAfterHours) ||
      props.autoAcceptAfterHours < 1 ||
      props.autoAcceptAfterHours > MAX_HOURS
    ) {
      throw new InvalidReviewSettingsException(
        `autoAcceptAfterHours must be a whole number of hours between 1 and ${MAX_HOURS}`,
      );
    }
    if (!Number.isInteger(props.samplePercent) || props.samplePercent < 0 || props.samplePercent > 100) {
      throw new InvalidReviewSettingsException('samplePercent must be a whole number between 0 and 100');
    }
    return new ReviewAiPolicy(props.mode, props.autoAcceptAfterHours, props.samplePercent);
  }

  /** Rebuilt from a row, which the checks above were already applied to. */
  static rehydrate(props: {
    mode: ReviewAiMode;
    autoAcceptAfterHours: number;
    samplePercent: number;
  }): ReviewAiPolicy {
    return new ReviewAiPolicy(props.mode, props.autoAcceptAfterHours, props.samplePercent);
  }

  /** Whether a model answers before the teacher — the part the feature key sells. */
  get usesAi(): boolean {
    return this.mode !== ReviewAiMode.TEACHER_ONLY;
  }
}
