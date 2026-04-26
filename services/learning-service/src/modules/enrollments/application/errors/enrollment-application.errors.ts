export class EnrollmentApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EnrollmentNotFoundError extends EnrollmentApplicationError {
  constructor(id: string) { super(`Enrollment not found: ${id}`); }
}

export class EnrollmentForbiddenError extends EnrollmentApplicationError {
  constructor(action: string) { super(`Forbidden: ${action}`); }
}

export class EnrollmentAlreadyExistsError extends EnrollmentApplicationError {
  constructor(containerId: string) { super(`Already enrolled in container: ${containerId}`); }
}

export class EnrollmentDomainValidationError extends EnrollmentApplicationError {
  constructor(detail: string) { super(`Domain validation failed: ${detail}`); }
}

export class AccessDeniedForContainerError extends EnrollmentApplicationError {
  constructor(tier: string) { super(`Access denied for container with tier: ${tier}`); }
}

export class ContentServiceUnavailableError extends EnrollmentApplicationError {
  constructor(detail: string) { super(`Content Service unavailable: ${detail}`); }
}

export class OrganizationServiceUnavailableError extends EnrollmentApplicationError {
  constructor(detail: string) { super(`Organization Service unavailable: ${detail}`); }
}
