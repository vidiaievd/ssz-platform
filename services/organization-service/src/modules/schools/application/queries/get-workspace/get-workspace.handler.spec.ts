import { jest } from '@jest/globals';
import { GetWorkspaceHandler } from './get-workspace.handler.js';
import { GetWorkspaceQuery } from './get-workspace.query.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolKind } from '../../../domain/value-objects/school-kind.vo.js';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = 'owner-1';
const TEACHER_ID = 'teacher-1';

type FakeSchool = {
  id: string;
  name: string;
  slug: string;
  kind: SchoolKind;
  isSolo: boolean;
  isDeleted: boolean;
  ownerId: string;
  roleOf: (userId: string) => MemberRole | null;
};

function school(over: Partial<FakeSchool> = {}): FakeSchool {
  const base: FakeSchool = {
    id: SCHOOL_ID,
    name: 'Nordick',
    slug: 'nordick',
    kind: SchoolKind.SCHOOL,
    isSolo: false,
    isDeleted: false,
    ownerId: OWNER_ID,
    roleOf: (userId) =>
      userId === OWNER_ID
        ? MemberRole.OWNER
        : userId === TEACHER_ID
          ? MemberRole.TEACHER
          : null,
  };
  return { ...base, ...over };
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

  it('treats a deleted workspace as absent', async () => {
    const { handler } = setup(school({ isDeleted: true }));

    await expect(
      handler.execute(new GetWorkspaceQuery(SCHOOL_ID, OWNER_ID)),
    ).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});
