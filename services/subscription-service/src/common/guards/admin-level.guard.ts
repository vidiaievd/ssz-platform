import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminLevel, adminLevelAtLeast } from '@ssz/contracts';
import type { AuthenticatedUser } from '../../infrastructure/auth/jwt-verifier.service.js';
import { ADMIN_LEVEL_KEY } from '../decorators/require-admin-level.decorator.js';

/**
 * Admits `platform_admin` whose token carries an admin level at least the route's
 * (`@RequireAdminLevel`, handler over controller; none declared = `super`). The level is only
 * in tokens of the admin-panel client, so a web or mobile session of an admin gets 403 here.
 * Runs after the global JwtAuthGuard: no token is already a 401.
 */
@Injectable()
export class AdminLevelGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user?.isPlatformAdmin) throw new ForbiddenException('platform_admin role required');

    const required =
      this.reflector.getAllAndOverride<AdminLevel | undefined>(ADMIN_LEVEL_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? AdminLevel.SUPER;

    if (!adminLevelAtLeast(user.adminLevel, required)) {
      throw new ForbiddenException({ message: 'ADMIN_LEVEL_REQUIRED', requiredLevel: required });
    }
    return true;
  }
}
