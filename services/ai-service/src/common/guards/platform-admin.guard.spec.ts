import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard.js';

const ctx = (user: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('admits platform_admin', () => {
    expect(guard.canActivate(ctx({ userId: 'u', roles: ['platform_admin'], isPlatformAdmin: true }))).toBe(true);
  });

  it.each([
    ['student', { userId: 'u', roles: ['student'], isPlatformAdmin: false }],
    ['school_admin', { userId: 'u', roles: ['school_admin'], isPlatformAdmin: false }],
    ['no user', undefined],
  ])('refuses %s with 403', (_label, user) => {
    expect(() => guard.canActivate(ctx(user))).toThrow(ForbiddenException);
  });
});
