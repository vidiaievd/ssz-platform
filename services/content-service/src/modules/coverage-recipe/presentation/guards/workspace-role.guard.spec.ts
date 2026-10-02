import { jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { WorkspaceRoleGuard, type WorkspaceAction } from './workspace-role.guard.js';
import { AccessDeniedException } from '../../../../shared/access-control/presentation/exceptions/access-denied.exception.js';
import { OrganizationServiceUnavailableException } from '../../../../shared/access-control/infrastructure/clients/organization-service-unavailable.exception.js';

function setup(
  action: WorkspaceAction | undefined,
  role: string | null | Error,
  isPlatformAdmin = false,
) {
  const reflector = { getAllAndOverride: jest.fn(() => action) } as unknown as Reflector;
  const organization = {
    getMemberRole: jest.fn(() =>
      role instanceof Error ? Promise.reject(role) : Promise.resolve(role),
    ),
  };
  const request = {
    user: { userId: 'user-1', roles: [], isPlatformAdmin },
    params: { schoolId: 'school-1' },
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard: new WorkspaceRoleGuard(reflector, organization as never), context, organization };
}

describe('WorkspaceRoleGuard', () => {
  it.each(['owner', 'content_admin'])('lets a %s edit the recipe', async (role) => {
    const { guard, context } = setup('edit', role);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each(['admin', 'teacher', 'student'])('refuses a %s the edit', async (role) => {
    const { guard, context } = setup('edit', role);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(AccessDeniedException);
  });

  it.each(['owner', 'content_admin', 'admin', 'teacher'])('lets a %s read it', async (role) => {
    const { guard, context } = setup('view', role);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses a student and a stranger the read', async () => {
    for (const role of ['student', null]) {
      const { guard, context } = setup('view', role);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(AccessDeniedException);
    }
  });

  it('lets a platform admin through without asking organization-service', async () => {
    const { guard, context, organization } = setup('edit', null, true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(organization.getMemberRole).not.toHaveBeenCalled();
  });

  it('answers 503, not 403, when organization-service is down', async () => {
    const { guard, context } = setup(
      'view',
      new OrganizationServiceUnavailableException(new Error('down')),
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
