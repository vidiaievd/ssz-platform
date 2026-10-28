import { jest } from '@jest/globals';
import { GetStudentStandingHandler } from './get-student-standing.handler.js';
import { GetStudentStandingQuery } from './get-student-standing.query.js';

// Plan 83, step 3: the school pays for the assistant of its current students only.

function standing(member: { role: string; status: string } | null) {
  const findUnique = jest.fn<() => Promise<unknown>>().mockResolvedValue(member);
  const handler = new GetStudentStandingHandler({ schoolMember: { findUnique } } as never);
  return handler.execute(new GetStudentStandingQuery('school-1', 'user-1'));
}

describe('GetStudentStandingHandler', () => {
  it('counts an active student', async () => {
    expect(await standing({ role: 'STUDENT', status: 'active' })).toEqual({ activeStudent: true });
  });

  it('does not count an archived student, staff, or somebody off the roster', async () => {
    expect(await standing({ role: 'STUDENT', status: 'archived' })).toEqual({ activeStudent: false });
    expect(await standing({ role: 'TEACHER', status: 'active' })).toEqual({ activeStudent: false });
    expect(await standing(null)).toEqual({ activeStudent: false });
  });
});
