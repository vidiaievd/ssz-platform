import { jest } from '@jest/globals';
import { GetStudentStandingHandler } from './get-student-standing.handler.js';
import { GetStudentStandingQuery } from './get-student-standing.query.js';

// Plan 83, step 3: the school pays for the assistant of its current students only;
// step 3b (Q6): and only of those it chose.

interface SchoolChoice {
  assistantMode: string;
  assistantGroupIds?: string[];
  assistantStudentIds?: string[];
}

function setup(member: { role: string; status: string } | null, school: SchoolChoice = { assistantMode: 'all_students' }, seat: unknown = null) {
  const findUnique = jest.fn<() => Promise<unknown>>().mockResolvedValue(
    member && {
      ...member,
      school: { assistantGroupIds: [], assistantStudentIds: [], ...school },
    },
  );
  const findFirst = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(seat);
  const handler = new GetStudentStandingHandler({ schoolMember: { findUnique }, schoolGroupMember: { findFirst } } as never);
  return { run: () => handler.execute(new GetStudentStandingQuery('school-1', 'user-1')), findFirst };
}

const ACTIVE = { role: 'STUDENT', status: 'active' };

describe('GetStudentStandingHandler', () => {
  it('counts an active student, allowed under the default all_students', async () => {
    expect(await setup(ACTIVE).run()).toEqual({ activeStudent: true, assistantAllowed: true });
  });

  it('does not count an archived student, staff, or somebody off the roster', async () => {
    const no = { activeStudent: false, assistantAllowed: false };
    expect(await setup({ role: 'STUDENT', status: 'archived' }).run()).toEqual(no);
    expect(await setup({ role: 'TEACHER', status: 'active' }).run()).toEqual(no);
    expect(await setup(null).run()).toEqual(no);
  });

  it('allows nobody when the school turned the assistant off', async () => {
    expect(await setup(ACTIVE, { assistantMode: 'off' }).run()).toEqual({ activeStudent: true, assistantAllowed: false });
  });

  it('allows only the chosen students', async () => {
    expect(
      await setup(ACTIVE, { assistantMode: 'selected_students', assistantStudentIds: ['user-1'] }).run(),
    ).toMatchObject({ assistantAllowed: true });
    expect(
      await setup(ACTIVE, { assistantMode: 'selected_students', assistantStudentIds: ['user-2'] }).run(),
    ).toMatchObject({ assistantAllowed: false });
  });

  it('allows an active member of a chosen group of this school', async () => {
    const choice = { assistantMode: 'selected_groups', assistantGroupIds: ['g-1'] };
    const yes = setup(ACTIVE, choice, { id: 'seat-1' });
    expect(await yes.run()).toMatchObject({ assistantAllowed: true });
    expect(yes.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: 'active',
        groupId: { in: ['g-1'] },
        group: { schoolId: 'school-1', deletedAt: null },
      },
      select: { id: true },
    });

    expect(await setup(ACTIVE, choice, null).run()).toMatchObject({ assistantAllowed: false });
  });

  it('does not look for a seat when no group is chosen', async () => {
    const empty = setup(ACTIVE, { assistantMode: 'selected_groups' });
    expect(await empty.run()).toMatchObject({ assistantAllowed: false });
    expect(empty.findFirst).not.toHaveBeenCalled();
  });
});
