export class AssignmentApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AssignmentNotFoundError extends AssignmentApplicationError {
  constructor(id: string) { super(`Assignment not found: ${id}`); }
}

export class AssignmentForbiddenError extends AssignmentApplicationError {
  constructor(action: string) { super(`Forbidden: ${action}`); }
}

export class ContentNotVisibleForAssigneeError extends AssignmentApplicationError {
  constructor(reason?: string) { super(`Content is not accessible for this student${reason ? ': ' + reason : ''}`); }
}

export class ContentServiceUnavailableError extends AssignmentApplicationError {
  constructor(detail: string) { super(`Content Service unavailable: ${detail}`); }
}

export class OrganizationServiceUnavailableError extends AssignmentApplicationError {
  constructor(detail: string) { super(`Organization Service unavailable: ${detail}`); }
}

export class SchoolMembershipRequiredError extends AssignmentApplicationError {
  constructor() { super('Private tutor assignments are not supported in MVP — a school context is required'); }
}

export class InsufficientSchoolRoleError extends AssignmentApplicationError {
  constructor(detail: string) { super(`Insufficient school role: ${detail}`); }
}

export class AssignmentDomainValidationError extends AssignmentApplicationError {
  constructor(detail: string) { super(`Domain validation failed: ${detail}`); }
}

export class InvalidContentRefError extends AssignmentApplicationError {
  constructor(detail: string) { super(`Invalid content reference: ${detail}`); }
}
