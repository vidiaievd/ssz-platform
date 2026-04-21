import { ForbiddenException } from '@nestjs/common';

export class AccessDeniedException extends ForbiddenException {
  constructor(reason?: string) {
    super({ message: 'Access denied', code: 'ACCESS_DENIED', reason });
  }
}
