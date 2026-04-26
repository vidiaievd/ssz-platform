import { DomainError } from '../../../../shared/domain/domain.error.js';

export class EnrollmentAlreadyActiveError extends DomainError {
  constructor(containerId: string) {
    super(`Already enrolled in container: ${containerId}`);
  }
}

export class EnrollmentAlreadyCompletedError extends DomainError {
  constructor() { super('Cannot modify a completed enrollment'); }
}

export class EnrollmentAlreadyUnenrolledError extends DomainError {
  constructor() { super('Already unenrolled from this container'); }
}

export class InvalidEnrollmentTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Invalid enrollment transition: ${from} → ${to}`);
  }
}

export type EnrollmentDomainError =
  | EnrollmentAlreadyActiveError
  | EnrollmentAlreadyCompletedError
  | EnrollmentAlreadyUnenrolledError
  | InvalidEnrollmentTransitionError;
