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

/** The learner has not reached this grammar atom in the course (plan 85, step 6). */
export class SrsAtomNotReachedError extends Error {
  constructor(atomId: string) {
    super(`Grammar atom ${atomId} has not been reached in this course`);
    this.name = 'SrsAtomNotReachedError';
  }
}

/**
 * Content Service failed for part of the course and the atom was not among what it did
 * answer: whether it was reached is unknown, so nothing is decided (plan 85, step 6).
 */
export class SrsAtomCoverageUnavailableError extends Error {
  constructor() {
    super('Course coverage is unavailable — try again later');
    this.name = 'SrsAtomCoverageUnavailableError';
  }
}

export type SrsApplicationError =
  | SrsCardNotFoundError
  | SrsCardUnauthorizedError
  | SrsReviewLimitError
  | SrsCardSuspendedError
  | SrsAtomNotReachedError
  | SrsAtomCoverageUnavailableError;
