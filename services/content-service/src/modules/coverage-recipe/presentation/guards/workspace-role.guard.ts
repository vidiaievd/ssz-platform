import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import {
  ORGANIZATION_CLIENT,
  type IOrganizationClient,
  type SchoolMemberRole,
} from '../../../../shared/access-control/domain/ports/organization-client.port.js';
import { AccessDeniedException } from '../../../../shared/access-control/presentation/exceptions/access-denied.exception.js';
import { OrganizationServiceUnavailableException } from '../../../../shared/access-control/infrastructure/clients/organization-service-unavailable.exception.js';

export type WorkspaceAction = 'view' | 'edit';

const WORKSPACE_ACTION_KEY = 'workspace-action';

/** Which workspace action a route performs; the workspace id is the `schoolId` param. */
export const RequireWorkspaceAccess = (action: WorkspaceAction) =>
  SetMetadata(WORKSPACE_ACTION_KEY, action);

/**
 * The same split `VisibilityCheckerService` draws for a school's content, applied to the
 * school itself: its editors (owner, content_admin) change the standard, and every member
 * who is not a learner may read it. A student is refused — a recipe is a teacher's tool,
 * and a learner has no screen that reads it.
 */
const ROLES: Record<WorkspaceAction, ReadonlySet<SchoolMemberRole>> = {
  edit: new Set(['owner', 'content_admin']),
  view: new Set(['owner', 'content_admin', 'admin', 'teacher']),
};

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  private readonly logger = new Logger(WorkspaceRoleGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(ORGANIZATION_CLIENT) private readonly organization: IOrganizationClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<WorkspaceAction | undefined>(
      WORKSPACE_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) return true;

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    if (request.user.isPlatformAdmin) return true;

    const schoolId = request.params['schoolId'] as string;
    let role: SchoolMemberRole | null;
    try {
      role = await this.organization.getMemberRole(request.user.userId, schoolId);
    } catch (err) {
      if (err instanceof OrganizationServiceUnavailableException) {
        this.logger.error(`Organization Service unavailable: ${err.message}`);
        throw new ServiceUnavailableException('Organization Service is temporarily unavailable');
      }
      throw err;
    }

    if (role !== null && ROLES[action].has(role)) return true;
    throw new AccessDeniedException('insufficient_workspace_role');
  }
}
