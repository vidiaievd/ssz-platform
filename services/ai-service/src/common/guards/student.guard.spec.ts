import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { StudentGuard } from './student.guard.js';

const ctx = (user: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('StudentGuard', () => {
  const guard = new StudentGuard();

  it.each([
    ['student', ['student']],
    ['a student who also tutors', ['tutor', 'student']],
  ])('admits %s', (_label, roles) => {
    expect(guard.canActivate(ctx({ userId: 'u', roles, isPlatformAdmin: false }))).toBe(true);
  });

  it.each([
    ['tutor', { userId: 'u', roles: ['tutor'], isPlatformAdmin: false }],
    ['platform_admin', { userId: 'u', roles: ['platform_admin'], isPlatformAdmin: true }],
    ['no user', undefined],
  ])('refuses %s with 403', (_label, user) => {
    expect(() => guard.canActivate(ctx(user))).toThrow(ForbiddenException);
  });
});
