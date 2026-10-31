import { InvalidAiPrecheckSettingsException } from '../exceptions/invalid-ai-precheck-settings.exception.js';

/** The subscription feature key a school needs to pay for its learners' rehearsals. */
export const AI_PRACTICE_FEATURE_KEY = 'ai.practice';

/** What ai-service accepts per (learner, exercise); above it a limit is no limit at all. */
const MAX_PER_EXERCISE = 1000;
/** Far above any plan; a guard against a typo, not a price. */
const MAX_MONTHLY_CREDITS = 1_000_000;

/** No limit, or a whole number from 1 to `max`: a limit of 0 is the switch turned off. */
function isWholeUpTo(limit: number | null, max: number): boolean {
  return limit === null || (Number.isInteger(limit) && limit >= 1 && limit <= max);
}

/**
 * Whether a school's learners may have their work checked by a model before they hand it in
 * (plan 84, Q1–Q2), and the school's two limits on it; null = no limit of the school's own.
 *
 *  - `perExerciseLimit` — checks per (learner, exercise), ever: a new attempt does not reset it;
 *  - `perLearnerMonthlyCredits` — credits per learner per calendar month. The plan's
 *    `ai.practice` limit of the same name stays the ceiling: the school can only narrow it,
 *    and exercise-engine applies the lower of the two at check time, so a plan that shrinks
 *    after the save still holds.
 *
 * The third level, the school's pool, is the plan's `ai.practice` credits, held by ai-service.
 */
export class AiPrecheckSettings {
  private constructor(
    readonly enabled: boolean,
    readonly perExerciseLimit: number | null,
    readonly perLearnerMonthlyCredits: number | null,
  ) {}

  /** A new school's: off, with the limits it gets when it turns the checks on. */
  static default(): AiPrecheckSettings {
    return new AiPrecheckSettings(false, 3, null);
  }

  static create(props: {
    enabled: boolean;
    perExerciseLimit: number | null;
    perLearnerMonthlyCredits: number | null;
  }): AiPrecheckSettings {
    const { perExerciseLimit, perLearnerMonthlyCredits } = props;
    if (!isWholeUpTo(perExerciseLimit, MAX_PER_EXERCISE)) {
      throw new InvalidAiPrecheckSettingsException(
        `Checks per exercise must be a whole number from 1 to ${MAX_PER_EXERCISE}, or no limit`,
      );
    }
    if (!isWholeUpTo(perLearnerMonthlyCredits, MAX_MONTHLY_CREDITS)) {
      throw new InvalidAiPrecheckSettingsException(
        `Credits per learner a month must be a whole number from 1 to ${MAX_MONTHLY_CREDITS}, or no limit`,
      );
    }
    return new AiPrecheckSettings(props.enabled, perExerciseLimit, perLearnerMonthlyCredits);
  }

  /** Rebuilt from a row, which the checks above were already applied to. */
  static rehydrate(props: {
    enabled: boolean;
    perExerciseLimit: number | null;
    perLearnerMonthlyCredits: number | null;
  }): AiPrecheckSettings {
    return new AiPrecheckSettings(props.enabled, props.perExerciseLimit, props.perLearnerMonthlyCredits);
  }
}
