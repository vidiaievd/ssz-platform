export class ReviewApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SubmissionNotFoundError extends ReviewApplicationError {
  constructor(id: string) { super(`Submission not found: ${id}`); }
}

export class SubmissionForbiddenError extends ReviewApplicationError {
  constructor(action: string) { super(`Forbidden: ${action}`); }
}

export class SubmissionDomainValidationError extends ReviewApplicationError {
  constructor(detail: string) { super(`Domain validation failed: ${detail}`); }
}

export class ReviewerNotAuthorizedError extends ReviewApplicationError {
  constructor(detail: string) { super(`Reviewer not authorized: ${detail}`); }
}

export class OrganizationServiceUnavailableError extends ReviewApplicationError {
  constructor(detail: string) { super(`Organization Service unavailable: ${detail}`); }
}
