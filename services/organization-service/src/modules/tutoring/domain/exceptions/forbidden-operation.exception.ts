export class ForbiddenOperationException extends Error {
  constructor(reason: string) {
    super(`Forbidden: ${reason}`);
    this.name = 'ForbiddenOperationException';
  }
}
