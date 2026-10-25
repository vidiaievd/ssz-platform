import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { ReviewBlockAccessService, decideBlockAccess } from './review-block-access.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';

const user = (userId: string, isPlatformAdmin = false): AuthenticatedUser => ({
  userId,
  roles: [],
  isPlatformAdmin,
});

describe('decideBlockAccess', () => {
  const base = { callerRole: null, targetRole: 'TEACHER', self: false, platformAdmin: false };

  it('lets a teacher hold their own time', () => {
    expect(decideBlockAccess({ ...base, callerRole: 'TEACHER', self: true })).toBe('ok');
  });

  it('lets the owner hold their own time — a tutor in their own workspace', () => {
    expect(decideBlockAccess({ ...base, targetRole: 'OWNER', callerRole: 'OWNER', self: true })).toBe('ok');
  });

  it("lets the school's timetable hold a teacher's time", () => {
    for (const callerRole of ['OWNER', 'ADMIN', 'MANAGER', 'SCHEDULER']) {
      expect(decideBlockAccess({ ...base, callerRole })).toBe('ok');
    }
  });

  it("keeps one teacher out of another's blocks", () => {
    expect(decideBlockAccess({ ...base, callerRole: 'TEACHER' })).toBe('NOT_ALLOWED');
    expect(decideBlockAccess({ ...base, callerRole: 'CONTENT_ADMIN' })).toBe('NOT_ALLOWED');
    expect(decideBlockAccess({ ...base, callerRole: null })).toBe('NOT_ALLOWED');
  });

  it('holds time only for somebody who marks work there', () => {
    for (const targetRole of ['STUDENT', 'SCHEDULER', 'CONTENT_ADMIN', null]) {
      expect(decideBlockAccess({ ...base, callerRole: 'OWNER', targetRole })).toBe('TARGET_NOT_REVIEWER');
    }
    // Not even a platform admin, and not for oneself.
    expect(decideBlockAccess({ ...base, targetRole: 'STUDENT', self: true, platformAdmin: true })).toBe(
      'TARGET_NOT_REVIEWER',
    );
  });
});

describe('ReviewBlockAccessService', () => {
  const rolesIn = (roles: Record<string, string | null>) => ({
    getMemberRole: jest.fn(async (_school: string, userId: string) => roles[userId] ?? null),
  });

  it('asks only about the teacher when they write their own', async () => {
    const roles = rolesIn({ t1: 'TEACHER' });
    await new ReviewBlockAccessService(roles).requireCanWrite('s1', 't1', user('t1'));
    expect(roles.getMemberRole).toHaveBeenCalledTimes(1);
  });

  it('refuses an outsider writing for a teacher', async () => {
    const service = new ReviewBlockAccessService(rolesIn({ t1: 'TEACHER' }));
    await expect(service.requireCanWrite('s1', 't1', user('stranger'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('answers 422 for a block held for a learner', async () => {
    const service = new ReviewBlockAccessService(rolesIn({ owner: 'OWNER', l1: 'STUDENT' }));
    await expect(service.requireCanWrite('s1', 'l1', user('owner'))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("opens the school's read to the timetable only", async () => {
    const service = new ReviewBlockAccessService(rolesIn({ admin: 'ADMIN', t1: 'TEACHER' }));
    await expect(service.requireCanReadSchool('s1', user('admin'))).resolves.toBeUndefined();
    await expect(service.requireCanReadSchool('s1', user('t1'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.requireCanReadSchool('s1', user('nobody', true))).resolves.toBeUndefined();
  });
});
