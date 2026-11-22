import { jest } from '@jest/globals';
import { LookupSchoolUserHandler } from './lookup-school-user.handler.js';
import { LookupSchoolUserQuery } from './lookup-school-user.query.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SchoolNotActiveException } from '../../../domain/exceptions/school-not-active.exception.js';
import { UserLookupRateLimitedException } from '../../../domain/exceptions/user-lookup-rate-limited.exception.js';
import { assertSchoolWritable, schoolReadableBy, type SchoolStatus } from '../../../domain/school-access.policy.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

const SCHOOL = 'school-1';
const OWNER = 'owner-1';

function build(opts: {
  roles?: Record<string, MemberRole>;
  status?: SchoolStatus;
  missing?: boolean;
  account?: { userId: string; roles: string[]; displayName?: string | null } | null;
  quota?: { allowed: boolean; retryAfterMs: number };
} = {}) {
  const status = opts.status ?? 'active';
  const school = {
    id: SCHOOL,
    ownerId: OWNER,
    isReadableBy: (id: string) => schoolReadableBy(status, { isOwner: id === OWNER }),
    roleOf: (id: string) => (id === OWNER ? MemberRole.OWNER : opts.roles?.[id] ?? null),
    assertWritable: () => assertSchoolWritable(SCHOOL, status),
  };
  const schools = { findById: jest.fn(async () => (opts.missing ? null : school)) };
  const lookup = {
    findByEmail: jest.fn(async () =>
      opts.account === undefined ? { userId: 'u-2', roles: ['tutor', 'STUDENT'], displayName: 'Olena' } : opts.account,
    ),
  };
  const rateLimiter = { consume: jest.fn(async () => opts.quota ?? { allowed: true, retryAfterMs: 0 }) };
  const handler = new LookupSchoolUserHandler(schools as never, lookup, rateLimiter);
  return { handler, lookup, rateLimiter };
}

const q = (who: string, email = ' olena@example.com ') => new LookupSchoolUserQuery(SCHOOL, who, email);

describe('LookupSchoolUserHandler', () => {
  it('answers found + userId + name + what the dialogs branch on, never the role list', async () => {
    const { handler, lookup, rateLimiter } = build();
    const answer = await handler.execute(q(OWNER));
    expect(answer).toEqual({ found: true, userId: 'u-2', displayName: 'Olena', isStudent: true, isTeacher: false });
    expect(answer).not.toHaveProperty('roles');
    expect(lookup.findByEmail).toHaveBeenCalledWith('olena@example.com');
    expect(rateLimiter.consume).toHaveBeenCalledWith(OWNER);
  });

  it('found: false for an address without an account', async () => {
    const { handler } = build({ account: null });
    await expect(handler.execute(q(OWNER))).resolves.toEqual({ found: false });
  });

  it('lets owner, admin, manager and teacher ask; refuses learners, other staff and strangers before counting', async () => {
    const roles = { a: MemberRole.ADMIN, m: MemberRole.MANAGER, t: MemberRole.TEACHER, s: MemberRole.STUDENT, c: MemberRole.CONTENT_ADMIN, d: MemberRole.SCHEDULER };
    const { handler, rateLimiter } = build({ roles });
    for (const who of ['a', 'm', 't']) await expect(handler.execute(q(who))).resolves.toMatchObject({ found: true });
    rateLimiter.consume.mockClear();
    for (const who of ['s', 'c', 'd', 'stranger']) {
      await expect(handler.execute(q(who))).rejects.toBeInstanceOf(ForbiddenOperationException);
    }
    expect(rateLimiter.consume).not.toHaveBeenCalled();
  });

  it('a school that is not active answers SCHOOL_NOT_ACTIVE (adding is a write); purged or missing is 404', async () => {
    await expect(build({ status: 'suspended' }).handler.execute(q(OWNER))).rejects.toBeInstanceOf(SchoolNotActiveException);
    await expect(build({ status: 'purged' }).handler.execute(q(OWNER))).rejects.toBeInstanceOf(SchoolNotFoundException);
    await expect(build({ missing: true }).handler.execute(q(OWNER))).rejects.toBeInstanceOf(SchoolNotFoundException);
  });

  it('over the limit → LOOKUP_RATE_LIMITED without asking user-profile', async () => {
    const { handler, lookup } = build({ quota: { allowed: false, retryAfterMs: 61_200 } });
    const err = await handler.execute(q(OWNER)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserLookupRateLimitedException);
    expect((err as UserLookupRateLimitedException).retryAfterSeconds).toBe(62);
    expect(lookup.findByEmail).not.toHaveBeenCalled();
  });

  it('a failed lookup is an error, never "not found" (that would send a registration letter)', async () => {
    const { handler, lookup } = build();
    lookup.findByEmail.mockImplementationOnce(async () => {
      throw new Error('user-profile down');
    });
    await expect(handler.execute(q(OWNER))).rejects.toThrow('user-profile down');
  });
});
