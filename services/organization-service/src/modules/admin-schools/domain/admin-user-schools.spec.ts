import { assembleUserSchools, type AdminUserSchoolRef, type AdminUserSchoolRows } from './admin-user-schools.js';

const USER = '22222222-2222-5222-8222-222222222222';

function school(id: string, over: Partial<AdminUserSchoolRef> = {}): AdminUserSchoolRef {
  return { id, name: `School ${id}`, slug: id, kind: 'SCHOOL', status: 'active', closesAt: null, purgeAt: null, ...over };
}

function rows(over: Partial<AdminUserSchoolRows> = {}): AdminUserSchoolRows {
  return { owned: [], memberships: [], groups: [], ...over };
}

describe("a user's schools for the admin", () => {
  it('answers two empty lists for a user organization never saw', () => {
    expect(assembleUserSchools(USER, rows())).toEqual({ userId: USER, owned: [], memberships: [] });
  });

  it('lists closed schools and leaves purged ones out, owned and roster alike', () => {
    const closed = school('a', { status: 'closed', purgeAt: new Date('2027-05-01') });
    const purged = school('b', { status: 'purged' });
    const result = assembleUserSchools(
      USER,
      rows({
        owned: [
          { ...closed, createdAt: new Date('2026-01-01') },
          { ...purged, createdAt: new Date('2026-02-01') },
        ],
        memberships: [
          { school: purged, role: 'TEACHER', status: 'active', joinedAt: new Date('2026-03-01') },
          { school: closed, role: 'STUDENT', status: 'archived', joinedAt: new Date('2026-03-02') },
        ],
      }),
    );

    expect(result.owned.map((s) => s.id)).toEqual(['a']);
    expect(result.owned[0]).toMatchObject({ status: 'closed', purgeAt: new Date('2027-05-01') });
    expect(result.memberships.map((m) => m.school.id)).toEqual(['a']);
  });

  it('puts the newest first and maps the roster role into the panel groups', () => {
    const result = assembleUserSchools(
      USER,
      rows({
        owned: [
          { ...school('old'), createdAt: new Date('2025-01-01') },
          { ...school('new', { kind: 'SOLO' }), createdAt: new Date('2026-01-01') },
        ],
        memberships: [
          { school: school('x'), role: 'MANAGER', status: 'active', joinedAt: new Date('2025-06-01') },
          { school: school('y'), role: 'STUDENT', status: 'active', joinedAt: new Date('2026-06-01') },
        ],
      }),
    );

    expect(result.owned.map((s) => s.id)).toEqual(['new', 'old']);
    expect(result.memberships.map((m) => [m.school.id, m.role, m.rosterRole])).toEqual([
      ['y', 'student', 'STUDENT'],
      ['x', 'staff', 'MANAGER'],
    ]);
  });

  it('hangs each group on its own school, once per role, sorted by name', () => {
    const g = (id: string, name: string, isDefault = false) => ({ id, name, isDefault });
    const result = assembleUserSchools(
      USER,
      rows({
        owned: [{ ...school('solo', { kind: 'SOLO' }), createdAt: new Date('2026-01-01') }],
        memberships: [{ school: school('x'), role: 'TEACHER', status: 'active', joinedAt: new Date('2026-01-01') }],
        groups: [
          { schoolId: 'x', group: g('g2', 'B2 dag'), as: 'teacher' },
          { schoolId: 'x', group: g('g1', 'A2 kveld'), as: 'teacher' },
          // Primary and substitute on the same group come as two assignment rows.
          { schoolId: 'x', group: g('g1', 'A2 kveld'), as: 'teacher' },
          { schoolId: 'solo', group: g('d', 'Alle', true), as: 'teacher' },
        ],
      }),
    );

    expect(result.memberships[0].groups).toEqual([
      { id: 'g1', name: 'A2 kveld', isDefault: false, as: 'teacher' },
      { id: 'g2', name: 'B2 dag', isDefault: false, as: 'teacher' },
    ]);
    expect(result.owned[0].groups).toEqual([{ id: 'd', name: 'Alle', isDefault: true, as: 'teacher' }]);
  });

  it('keeps a group twice when the user is a learner and a teacher in it', () => {
    const group = { id: 'g', name: 'A1', isDefault: false };
    const result = assembleUserSchools(
      USER,
      rows({
        memberships: [{ school: school('x'), role: 'TEACHER', status: 'active', joinedAt: new Date('2026-01-01') }],
        groups: [
          { schoolId: 'x', group, as: 'observer' },
          { schoolId: 'x', group, as: 'teacher' },
        ],
      }),
    );

    expect(result.memberships[0].groups.map((x) => x.as)).toEqual(['observer', 'teacher']);
  });
});
