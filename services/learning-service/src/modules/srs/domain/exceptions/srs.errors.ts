import { DomainError } from '../../../../shared/domain/domain.error.js';

export class CardSuspendedError extends DomainError {
  constructor() {
    super('Cannot review a suspended card');
  }
}

// Defined for completeness; not raised because early reviews are allowed (MVP).
export class CardNotDueError extends DomainError {
  constructor(dueAt: Date) {
    super(`Card is not due until ${dueAt.toISOString()}`);
  }
}

export class CardAlreadyExistsError extends DomainError {
  constructor() {
    super('A review card for this content already exists for this user');
  }
}

export class DailyNewCardLimitReachedError extends DomainError {
  constructor() {
    super('Daily new-card introduction limit reached');
  }
}

export class DailyReviewLimitReachedError extends DomainError {
  constructor() {
    super('Daily review limit reached');
  }
}

export type SrsDomainError =
  | CardSuspendedError
  | CardNotDueError
  | CardAlreadyExistsError
  | DailyNewCardLimitReachedError
  | DailyReviewLimitReachedError;
