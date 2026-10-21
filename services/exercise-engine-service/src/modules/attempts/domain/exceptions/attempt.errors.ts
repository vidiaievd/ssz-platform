import { DomainError } from '../../../../shared/domain/domain.error.js';

export class InvalidAttemptTransitionError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * The store refused a second open attempt on the same exercise for the same learner.
 *
 * Not a rule the entity can check: it is about other rows. The partial unique index
 * `attempts_one_open_per_user_exercise` holds it, because two starts racing each other both
 * found no open attempt before either was saved (plan 76, 2.5). A start that meets it looks
 * again and is handed the winner; anything else that meets it answers 409.
 */
export class OpenAttemptExistsError extends Error {
  constructor() {
    super('Another attempt on this exercise is already open');
    this.name = 'OpenAttemptExistsError';
  }
}

export class AttemptAlreadySubmittedError extends DomainError {
  constructor() {
    super('Attempt has already been submitted');
  }
}

export class AttemptNotSubmittedError extends DomainError {
  constructor() {
    super('Attempt must be in SUBMITTED status for this operation');
  }
}

/**
 * A submission was sent back with nothing said about why.
 *
 * The one outcome a learner cannot act on: "try again" without a reason is the silence
 * the marking queue exists to end, and the second attempt would be a guess (criterion 18).
 */
export class ReviewCommentRequiredError extends DomainError {
  constructor() {
    super('A submission sent back must say why');
  }
}

export class InvalidScoreError extends DomainError {
  constructor(score: number) {
    super(`Score must be between 0 and 100, got ${score}`);
  }
}

export type AttemptDomainError =
  | InvalidAttemptTransitionError
  | AttemptAlreadySubmittedError
  | AttemptNotSubmittedError
  | ReviewCommentRequiredError
  | InvalidScoreError;
