import { createParamDecorator, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../infrastructure/auth/jwt-verifier.service.js';
import type { AdminActor } from '../../shared/application/admin-audit.js';

/**
 * The admin behind the request, for the trail. Only on routes behind `AdminLevelGuard`, which
 * already refuses a token without a level; the check here keeps the type honest.
 */
export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): AdminActor => {
  const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
  if (!user?.adminLevel) throw new ForbiddenException({ message: 'ADMIN_LEVEL_REQUIRED' });
  return { userId: user.userId, level: user.adminLevel };
});
