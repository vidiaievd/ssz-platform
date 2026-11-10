import { jest } from '@jest/globals';
import { GetSchoolSeatsHandler } from './get-school-seats.handler.js';
import { GetSchoolSeatsQuery } from './get-school-seats.query.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';

const SCHOOL = 'school-1';
const OWNER = 'owner-1';

function build(opts: { roles?: Record<string, string>; deleted?: boolean; missing?: boolean; limit?: { known: true; max: number | null } | { known: false }; used?: number } = {}) {
  const school = {
    id: SCHOOL,
    ownerId: OWNER,
    isDeleted: opts.deleted ?? false,
    getMemberRole: (id: string) => opts.roles?.[id],
  };
  const schools = { findById: jest.fn(async () => (opts.missing ? null : school)) };
  const limits = { studentSeatLimit: jest.fn(async () => opts.limit ?? { known: true as const, max: 100 }) };
  const seats = { countActiveStudents: jest.fn(async () => opts.used ?? 0) };
  return new GetSchoolSeatsHandler(schools as never, limits as never, seats as never);
}

describe('GetSchoolSeatsHandler', () => {
  it('answers used / limit / ceiling / state to the owner', async () => {
    const h = build({ used: 105 });
    await expect(h.execute(new GetSchoolSeatsQuery(SCHOOL, OWNER))).resolves.toEqual({
      used: 105, limit: 100, ceiling: 110, state: 'warning',
    });
  });

  it('lets admin and manager read, refuses teacher, student and strangers', async () => {
    const h = build({ roles: { a: 'ADMIN', m: 'MANAGER', t: 'TEACHER', s: 'STUDENT' } });
    await expect(h.execute(new GetSchoolSeatsQuery(SCHOOL, 'a'))).resolves.toMatchObject({ state: 'ok' });
    await expect(h.execute(new GetSchoolSeatsQuery(SCHOOL, 'm'))).resolves.toMatchObject({ state: 'ok' });
    for (const who of ['t', 's', 'stranger']) {
      await expect(h.execute(new GetSchoolSeatsQuery(SCHOOL, who))).rejects.toBeInstanceOf(ForbiddenOperationException);
    }
  });

  it('shows no limit when the plan has none or could not be read', async () => {
    for (const limit of [{ known: true as const, max: null }, { known: false as const }]) {
      const h = build({ limit, used: 7 });
      await expect(h.execute(new GetSchoolSeatsQuery(SCHOOL, OWNER))).resolves.toEqual({
        used: 7, limit: null, ceiling: null, state: 'ok',
      });
    }
  });

  it('is a 404 for a missing or deleted school', async () => {
    await expect(build({ missing: true }).execute(new GetSchoolSeatsQuery(SCHOOL, OWNER))).rejects.toBeInstanceOf(SchoolNotFoundException);
    await expect(build({ deleted: true }).execute(new GetSchoolSeatsQuery(SCHOOL, OWNER))).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});
