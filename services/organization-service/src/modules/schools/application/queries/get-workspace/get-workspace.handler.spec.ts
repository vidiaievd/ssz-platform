import { jest } from '@jest/globals';
import { GetWorkspaceHandler } from './get-workspace.handler.js';
import { GetWorkspaceQuery } from './get-workspace.query.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolKind } from '../../../domain/value-objects/school-kind.vo.js';
import { schoolReadableBy, type SchoolStatus } from '../../../domain/school-access.policy.js';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = 'owner-1';
const TEACHER_ID = 'teacher-1';

type FakeSchool = {
  id: string;
  name: string;
  slug: string;
  kind: SchoolKind;
  isSolo: boolean;
  ownerId: string;
  status: SchoolStatus;
  closesAt: Date | null;
  purgeAt: Date | null;
  roleOf: (userId: string) => MemberRole | null;
  isReadableBy: (userId: string) => boolean;
};

function school(over: Partial<FakeSchool> = {}): FakeSchool {
  const base: FakeSchool = {
    id: SCHOOL_ID,
    name: 'Nordick',
    slug: 'nordick',
    kind: SchoolKind.SCHOOL,
    isSolo: false,
    ownerId: OWNER_ID,
    status: 'active',
    closesAt: null,
    purgeAt: null,
    roleOf: (userId) =>
      userId === OWNER_ID
        ? MemberRole.OWNER
        : userId === TEACHER_ID
          ? MemberRole.TEACHER
          : null,
    isReadableBy: () => true,
  };
  const merged = { ...base, ...over };
  // The same rule as the aggregate's, over the status this fake was given.
  merged.isReadableBy = (userId) => schoolReadableBy(merged.status, { isOwner: userId === merged.ownerId });
  return merged;
}

function setup(byId: FakeSchool | null, bySlug: FakeSchool | null = null) {
  const schoolRepository = {
    findById: jest.fn<() => Promise<unknown>>().mockResolvedValue(byId),
    findBySlug: jest.fn<() => Promise<unknown>>().mockResolvedValue(bySlug),
  };
  return {
    handler: new GetWorkspaceHandler(schoolRepository as never),
    schoolRepository,
  };
}

describe('GetWorkspaceHandler', () => {
  it('answers a school member with their effective role', async () => {
    const { handler } = setup(school());

    await expect(handler.execute(new GetWorkspaceQuery(SCHOOL_ID, TEACHER_ID))).resolves.toEqual({
      id: SCHOOL_ID,
      kind: SchoolKind.SCHOOL,
      name: 'Nordick',
      slug: 'nordick',
      myRole: MemberRole.TEACHER,
      status: 'active',
      closesAt: null,
      purgeAt: null,
    });
  });

  it('resolves a school by slug without touching the id column', async () => {
    const { handler, schoolRepository } = setup(null, school());

    const result = await handler.execute(new GetWorkspaceQuery('nordick', OWNER_ID));

    expect(result.id).toBe(SCHOOL_ID);
    // A slug is not a uuid; asking findById for one is a database error, not a miss.
    expect(schoolRepository.findById).not.toHaveBeenCalled();
  });

  it("names a solo workspace's owner OWNER and hides its slug", async () => {
    const solo = school({
      kind: SchoolKind.SOLO,
      isSolo: true,
      slug: `solo-${OWNER_ID}`,
      name: 'Norsk med Dmytro',
      // The tutor holds no roster row of their own — ownership is the whole record of it.
      roleOf: (userId) => (userId === OWNER_ID ? MemberRole.OWNER : null),
    });
    const { handler } = setup(solo);

    await expect(handler.execute(new GetWorkspaceQuery(SCHOOL_ID, OWNER_ID))).resolves.toEqual({
      id: SCHOOL_ID,
      kind: SchoolKind.SOLO,
      name: 'Norsk med Dmytro',
      slug: null,
      myRole: MemberRole.OWNER,
      status: 'active',
      closesAt: null,
      purgeAt: null,
    });
  });

  it("refuses a solo workspace to its own learner, who is a member of it", async () => {
    const learner = 'student-1';
    const solo = school({
      kind: SchoolKind.SOLO,
      isSolo: true,
      roleOf: (userId) =>
        userId === OWNER_ID
          ? MemberRole.OWNER
          : userId === learner
            ? MemberRole.STUDENT
            : null,
    });
    const { handler } = setup(solo);

    await expect(handler.execute(new GetWorkspaceQuery(SCHOOL_ID, learner))).rejects.toBeInstanceOf(
      SchoolNotFoundException,
    );
  });

  it('gives a stranger the same answer as a workspace that does not exist', async () => {
    const stranger = setup(school());
    const missing = setup(null);

    await expect(
      stranger.handler.execute(new GetWorkspaceQuery(SCHOOL_ID, 'nobody')),
    ).rejects.toBeInstanceOf(SchoolNotFoundException);
    await expect(
      missing.handler.execute(new GetWorkspaceQuery(SCHOOL_ID, 'nobody')),
    ).rejects.toBeInstanceOf(SchoolNotFoundException);
  });

  // Plan 90, phase 5: a suspended school is still everyone's to open, read only.
  it('opens a suspended workspace to its members and says until when', async () => {
    const closesAt = new Date('2026-12-10T00:00:00Z');
    const { handler } = setup(school({ status: 'suspended', closesAt }));

    await expect(handler.execute(new GetWorkspaceQuery(SCHOOL_ID, TEACHER_ID))).resolves.toMatchObject({
      myRole: MemberRole.TEACHER,
      status: 'suspended',
      closesAt,
    });
  });

  it('opens a closed workspace to its owner alone, with the purge date', async () => {
    const purgeAt = new Date('2027-05-10T00:00:00Z');
    const { handler } = setup(school({ status: 'closed', purgeAt }));

    await expect(handler.execute(new GetWorkspaceQuery(SCHOOL_ID, OWNER_ID))).resolves.toMatchObject({
      status: 'closed',
      purgeAt,
    });
    await expect(
      handler.execute(new GetWorkspaceQuery(SCHOOL_ID, TEACHER_ID)),
    ).rejects.toBeInstanceOf(SchoolNotFoundException);
  });

  it('treats a purged workspace as absent, for its owner too', async () => {
    const { handler } = setup(school({ status: 'purged' }));

    await expect(
      handler.execute(new GetWorkspaceQuery(SCHOOL_ID, OWNER_ID)),
    ).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});
