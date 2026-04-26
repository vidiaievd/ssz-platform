import { DomainError } from '../../../../shared/domain/domain.error.js';

export class CannotAssignToSelfError extends DomainError {
  constructor() {
    super('Assigner and assignee must be different users');
  }
}

export class AssignmentDueDateInPastError extends DomainError {
  constructor() {
    super('Due date must be in the future');
  }
}

export class AssignmentAlreadyCancelledError extends DomainError {
  constructor() {
    super('Assignment is already cancelled');
  }
}

export class AssignmentAlreadyCompletedError extends DomainError {
  constructor() {
    super('Assignment is already completed');
  }
}

export class InvalidAssignmentTransitionError extends DomainError {
  constructor(detail: string) {
    super(`Invalid assignment state transition: ${detail}`);
  }
}

export type AssignmentDomainError =
  | CannotAssignToSelfError
  | AssignmentDueDateInPastError
  | AssignmentAlreadyCancelledError
  | AssignmentAlreadyCompletedError
  | InvalidAssignmentTransitionError;
