import { Controller, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminLevel } from '@ssz/contracts';
import { RequireAdminLevel } from '../decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from './admin-level.guard.js';

@RequireAdminLevel('support')
@Controller()
class SampleController {
  read(): void {}

  @RequireAdminLevel('admin')
  change(): void {}
}

@Controller()
class UndeclaredController {
  anything(): void {}
}

const admin = (adminLevel: AdminLevel | null) => ({
  userId: 'u',
  roles: ['platform_admin'],
  isPlatformAdmin: true,
  adminLevel,
});

const ctx = (user: unknown, cls: object, handler: () => void): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => cls,
  }) as unknown as ExecutionContext;

describe('AdminLevelGuard', () => {
  const guard = new AdminLevelGuard(new Reflector());
  const read = (user: unknown) => ctx(user, SampleController, SampleController.prototype.read);
  const change = (user: unknown) => ctx(user, SampleController, SampleController.prototype.change);
  const undeclared = (user: unknown) =>
    ctx(user, UndeclaredController, UndeclaredController.prototype.anything);

  it.each(['support', 'admin', 'super'] as const)('controller default admits %s', (level) => {
    expect(guard.canActivate(read(admin(level)))).toBe(true);
  });

  it('handler level overrides the controller default', () => {
    expect(() => guard.canActivate(change(admin('support')))).toThrow(ForbiddenException);
    expect(guard.canActivate(change(admin('admin')))).toBe(true);
    expect(guard.canActivate(change(admin('super')))).toBe(true);
  });

  it('a route with no declared level admits super only', () => {
    expect(() => guard.canActivate(undeclared(admin('admin')))).toThrow(ForbiddenException);
    expect(guard.canActivate(undeclared(admin('super')))).toBe(true);
  });

  it('refuses a platform_admin token without a level (web or mobile session)', () => {
    expect(() => guard.canActivate(read(admin(null)))).toThrow(ForbiddenException);
  });

  it.each([
    ['student', { userId: 'u', roles: ['student'], isPlatformAdmin: false, adminLevel: null }],
    ['a level without the role', { userId: 'u', roles: ['student'], isPlatformAdmin: false, adminLevel: 'super' }],
    ['no user', undefined],
  ])('refuses %s', (_label, user) => {
    expect(() => guard.canActivate(read(user))).toThrow(ForbiddenException);
  });
});
