export class OrganizationServiceUnavailableException extends Error {
  constructor(cause?: unknown) {
    super('Organization Service is unavailable after all retries');
    this.name = 'OrganizationServiceUnavailableException';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
