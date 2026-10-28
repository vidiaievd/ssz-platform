import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../infrastructure/auth/jwt-verifier.service.js';

/**
 * Admits a token carrying `student`. Runs after the global JwtAuthGuard, so a missing token is
 * already a 401 by the time this sees the request; a valid token without the role is 403.
 */
@Injectable()
export class StudentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user?.roles.includes('student')) throw new ForbiddenException('student role required');
    return true;
  }
}
