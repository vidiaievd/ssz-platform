import { DomainError } from '../../../../shared/domain/domain.error.js';

export class InvalidAttemptTransitionError extends DomainError {
  constructor(message: string) {
    super(message);
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

export class InvalidScoreError extends DomainError {
  constructor(score: number) {
    super(`Score must be between 0 and 100, got ${score}`);
  }
}

export type AttemptDomainError =
  | InvalidAttemptTransitionError
  | AttemptAlreadySubmittedError
  | AttemptNotSubmittedError
  | InvalidScoreError;
