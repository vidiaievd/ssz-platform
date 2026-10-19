export class SrsCardNotFoundError extends Error {
  constructor(id: string) {
    super(`SRS review card not found: ${id}`);
    this.name = 'SrsCardNotFoundError';
  }
}

export class SrsCardUnauthorizedError extends Error {
  constructor() {
    super('You do not own this review card');
    this.name = 'SrsCardUnauthorizedError';
  }
}

export class SrsReviewLimitError extends Error {
  constructor() {
    super('Daily review limit reached — come back tomorrow');
    this.name = 'SrsReviewLimitError';
  }
}

export class SrsCardSuspendedError extends Error {
  constructor() {
    super('Cannot review a suspended card — unsuspend it first');
    this.name = 'SrsCardSuspendedError';
  }
}

export type SrsApplicationError =
  | SrsCardNotFoundError
  | SrsCardUnauthorizedError
  | SrsReviewLimitError
  | SrsCardSuspendedError;
