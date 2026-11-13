import { jest } from '@jest/globals';
import type { AdminSchoolPage } from '../../domain/admin-school.js';
import { GetAdminSchoolHandler } from './get-admin-school.handler.js';
import { GetAdminSchoolQuery } from './get-admin-school.query.js';
import { ListAdminSchoolsHandler } from './list-admin-schools.handler.js';
import { ListAdminSchoolsQuery } from './list-admin-schools.query.js';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
const page: AdminSchoolPage = { items: [], total: 0, page: 1, limit: 25 };

const row = {
  id: SCHOOL_ID,
  name: 'Nordick',
  slug: 'nordick',
  kind: 'SCHOOL' as const,
  type: 'ONLINE' as const,
  status: 'active' as const,
  description: null,
  avatarUrl: null,
  contacts: { email: null, website: null, city: 'Oslo' },
  ownerId: 'owner-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  deletedAt: null,
  counts: { students: 3, teachers: 1, archivedStudents: 0, staff: 0, pendingApplications: 0, pendingInvitations: 0 },
  groups: [],
  courses: { count: 0, ids: [] },
};

function setup(profile: () => Promise<unknown>) {
  const reader = {
    list: jest.fn<() => Promise<AdminSchoolPage>>().mockResolvedValue(page),
    findById: jest.fn<() => Promise<unknown>>().mockResolvedValue(row),
  };
  const profiles = {
    getTeachingLanguages: jest.fn(),
    getProfileSummary: jest.fn(profile),
  };
  return {
    reader,
    profiles,
    list: new ListAdminSchoolsHandler(reader as never),
    get: new GetAdminSchoolHandler(reader as never, profiles as never),
  };
}

describe('the admin list of schools', () => {
  it('trims the search and drops one that is only spaces', async () => {
    const { reader, list } = setup(async () => null);

    await list.execute(new ListAdminSchoolsQuery({ search: '  nord ', kind: 'SOLO' }, 'name', 2, 10));
    await list.execute(new ListAdminSchoolsQuery({ search: '   ' }, '-createdAt', 1, 25));

    expect(reader.list).toHaveBeenNthCalledWith(1, { search: 'nord', kind: 'SOLO' }, 'name', 2, 10);
    expect(reader.list).toHaveBeenNthCalledWith(2, { search: undefined }, '-createdAt', 1, 25);
  });
});

describe("the admin card of a school", () => {
  it("names the owner from profile-service, since the owner is not on the roster", async () => {
    const { get } = setup(async () => ({ userId: 'owner-1', name: 'Kari', email: 'kari@example.com', avatarUrl: null }));

    const card = await get.execute(new GetAdminSchoolQuery(SCHOOL_ID));

    expect(card?.owner).toEqual({ userId: 'owner-1', name: 'Kari', email: 'kari@example.com' });
    expect(card).not.toHaveProperty('ownerId');
    expect(card?.counts.students).toBe(3);
  });

  it('still answers when profile-service fails — the owner keeps an id, without a name', async () => {
    const { get } = setup(async () => {
      throw new Error('down');
    });

    const card = await get.execute(new GetAdminSchoolQuery(SCHOOL_ID));

    expect(card?.owner).toEqual({ userId: 'owner-1', name: null, email: null });
  });

  it('answers null for an unknown school and asks nobody about an owner', async () => {
    const { reader, profiles, get } = setup(async () => null);
    reader.findById.mockResolvedValue(null);

    await expect(get.execute(new GetAdminSchoolQuery(SCHOOL_ID))).resolves.toBeNull();
    expect(profiles.getProfileSummary).not.toHaveBeenCalled();
  });
});
