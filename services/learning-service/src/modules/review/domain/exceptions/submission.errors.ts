export class SubmissionDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SubmissionCannotBeResubmittedError extends SubmissionDomainError {
  constructor(status: string) {
    super(`Cannot resubmit: submission has status ${status} (must be REVISION_REQUESTED)`);
  }
}

export class SubmissionCannotBeReviewedError extends SubmissionDomainError {
  constructor(status: string) {
    super(`Cannot review: submission has status ${status} (must be PENDING_REVIEW or RESUBMITTED)`);
  }
}
