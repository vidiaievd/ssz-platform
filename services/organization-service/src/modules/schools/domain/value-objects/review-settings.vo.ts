import { InvalidReviewSettingsException } from '../exceptions/invalid-review-settings.exception.js';

/**
 * Who hears about a submission nobody answered in time.
 *
 * The strings are the database's enum member names, not a mapping of them: Prisma writes
 * the member name to the column, so a value that reads differently here would be a value
 * that never round-trips (see the `prisma-mapped-enum-trap` note in the schema).
 */
export const ReviewEscalationTarget = {
  SCHOOL_ADMINS: 'school_admins',
  OWNER: 'owner',
  PRIMARY_TEACHER: 'primary_teacher',
} as const;

export type ReviewEscalationTarget =
  (typeof ReviewEscalationTarget)[keyof typeof ReviewEscalationTarget];

/** A month. A promise longer than this is not a promise anybody is waiting on. */
const MAX_HOURS = 720;

/**
 * What a school promises a learner who hands in work for a person to read.
 *
 * Two durations and an address: answer within this many hours, and if nobody has after
 * this many, tell someone else. The engine holds neither — it reports `submittedAt` and
 * lets whoever knows the promise decide what is late (plan 44 §0.1). This is that
 * promise, and it lives with the groups and the roster it is made about.
 */
export class ReviewSettings {
  static readonly DEFAULT_RESPOND_WITHIN_HOURS = 48;
  static readonly DEFAULT_ESCALATE_AFTER_HOURS = 72;

  private constructor(
    readonly respondWithinHours: number,
    readonly escalateAfterHours: number,
    readonly escalateTo: ReviewEscalationTarget,
  ) {}

  static default(): ReviewSettings {
    return new ReviewSettings(
      ReviewSettings.DEFAULT_RESPOND_WITHIN_HOURS,
      ReviewSettings.DEFAULT_ESCALATE_AFTER_HOURS,
      ReviewEscalationTarget.SCHOOL_ADMINS,
    );
  }

  /**
   * Whole hours, both inside a month, and escalation never before the promise it is
   * escalating (plan 44 §44.12).
   *
   * The last rule is why this is a value object and not three columns with a check
   * constraint: an escalation that fires before the school has broken its word would page
   * an administrator about work that is still on time.
   */
  static create(props: {
    respondWithinHours: number;
    escalateAfterHours: number;
    escalateTo: ReviewEscalationTarget;
  }): ReviewSettings {
    hoursOrThrow(props.respondWithinHours, 'respondWithinHours');
    hoursOrThrow(props.escalateAfterHours, 'escalateAfterHours');

    if (props.escalateAfterHours < props.respondWithinHours) {
      throw new InvalidReviewSettingsException(
        'escalateAfterHours cannot be earlier than respondWithinHours',
      );
    }

    return new ReviewSettings(
      props.respondWithinHours,
      props.escalateAfterHours,
      props.escalateTo,
    );
  }

  /** Rebuilt from a row, which the constraints above were already applied to. */
  static rehydrate(props: {
    respondWithinHours: number;
    escalateAfterHours: number;
    escalateTo: ReviewEscalationTarget;
  }): ReviewSettings {
    return new ReviewSettings(
      props.respondWithinHours,
      props.escalateAfterHours,
      props.escalateTo,
    );
  }
}

function hoursOrThrow(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_HOURS) {
    throw new InvalidReviewSettingsException(
      `${field} must be a whole number of hours between 1 and ${MAX_HOURS}`,
    );
  }
}
