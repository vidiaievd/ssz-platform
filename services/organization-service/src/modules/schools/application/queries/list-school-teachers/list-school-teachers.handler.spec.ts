import { jest } from '@jest/globals';
import { ListSchoolTeachersHandler } from './list-school-teachers.handler.js';
import { ListSchoolTeachersQuery } from './list-school-teachers.query.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = 'owner-1';
const TEACHER_ID = 'teacher-1';

function setup(options: { isSolo: boolean; rows?: unknown[] }) {
  const school = {
    id: SCHOOL_ID,
    ownerId: OWNER_ID,
    isSolo: options.isSolo,
    getMemberRole: (userId: string) => (userId === TEACHER_ID ? MemberRole.TEACHER : null),
  };

  const schoolRepository = {
    findById: jest.fn<() => Promise<unknown>>().mockResolvedValue(school),
  };
  const profileService = {
    getTeachingLanguages: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ userId: OWNER_ID, langs: ['nb'] }),
    getProfileSummary: jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ userId: OWNER_ID, name: 'Dmytro', email: null, avatarUrl: null }),
  };
  const prisma = {
    schoolMember: {
      findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue(options.rows ?? []),
    },
  };

  const handler = new ListSchoolTeachersHandler(
    schoolRepository as never,
    profileService as never,
    prisma as never,
  );

  return { handler, profileService };
}

const query = new ListSchoolTeachersQuery(OWNER_ID, SCHOOL_ID);

describe("a private tutor's workspace", () => {
  it('names the tutor as its teacher, though no roster row says so', async () => {
    const { handler } = setup({ isSolo: true });

    const teachers = await handler.execute(query);

    expect(teachers).toHaveLength(1);
    expect(teachers[0]).toMatchObject({ userId: OWNER_ID, name: 'Dmytro', langs: ['nb'] });
  });

  it('keeps the tutor first when somebody else has been added as a teacher', async () => {
    const { handler } = setup({
      isSolo: true,
      rows: [{ userId: TEACHER_ID, name: 'Kari', avatarUrl: null, teacherAttrs: null }],
    });

    const teachers = await handler.execute(query);

    expect(teachers.map((t) => t.userId)).toEqual([OWNER_ID, TEACHER_ID]);
  });
});

describe('a school', () => {
  it('lists only its teacher rows — an owner who teaches nothing is not a teacher', async () => {
    const { handler, profileService } = setup({
      isSolo: false,
      rows: [{ userId: TEACHER_ID, name: 'Kari', avatarUrl: null, teacherAttrs: null }],
    });

    const teachers = await handler.execute(query);

    expect(teachers.map((t) => t.userId)).toEqual([TEACHER_ID]);
    expect(profileService.getProfileSummary).not.toHaveBeenCalled();
  });

  it('answers an empty list rather than inventing one', async () => {
    const { handler } = setup({ isSolo: false, rows: [] });

    await expect(handler.execute(query)).resolves.toEqual([]);
  });
});
