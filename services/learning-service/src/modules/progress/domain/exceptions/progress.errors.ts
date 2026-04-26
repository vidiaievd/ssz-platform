export class ProgressDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ProgressNotCompletedError extends ProgressDomainError {
  constructor() { super('Progress must be COMPLETED before it can be flagged for review'); }
}

export class ProgressNotUnderReviewError extends ProgressDomainError {
  constructor() { super('Progress is not currently under review'); }
}
