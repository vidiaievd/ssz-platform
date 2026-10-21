import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../infrastructure/auth/jwt-verifier.service.js';

/**
 * Admits `platform_admin` only. Runs after the global JwtAuthGuard, so a missing token is
 * already a 401 by the time this sees the request; a valid token of any other role is 403.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user?.isPlatformAdmin) throw new ForbiddenException('platform_admin role required');
    return true;
  }
}
