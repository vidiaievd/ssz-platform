export class ProgressApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ProgressNotFoundError extends ProgressApplicationError {
  constructor(detail: string) { super(`Progress record not found: ${detail}`); }
}

export class ProgressForbiddenError extends ProgressApplicationError {
  constructor(action: string) { super(`Forbidden: ${action}`); }
}

export class ProgressDomainValidationError extends ProgressApplicationError {
  constructor(detail: string) { super(`Domain validation failed: ${detail}`); }
}

export class AssignmentNotFoundForProgressError extends ProgressApplicationError {
  constructor(id: string) { super(`Assignment not found: ${id}`); }
}

export class InvalidProgressContentRefError extends ProgressApplicationError {
  constructor(detail: string) { super(`Invalid content reference: ${detail}`); }
}
