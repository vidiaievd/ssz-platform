import { jest } from '@jest/globals';
import { RECIPE_PRESETS } from '@ssz/shared-kernel/skills';
import { GetWorkspaceRecipeCoursesHandler } from './get-workspace-recipe-courses.handler.js';
import { GetWorkspaceRecipeCoursesQuery } from './get-workspace-recipe-courses.query.js';
import type { CourseRecipeUsage } from '../../../domain/repositories/course-recipe-usage.reader.interface.js';

function makeHandler(courses: CourseRecipeUsage[]) {
  const reader = {
    listForSchool: jest.fn<(schoolId: string) => Promise<CourseRecipeUsage[]>>(() =>
      Promise.resolve(courses),
    ),
  };
  return { handler: new GetWorkspaceRecipeCoursesHandler(reader as never), reader };
}

describe('GetWorkspaceRecipeCoursesHandler', () => {
  it('counts the three states and lists the courses that do not follow', async () => {
    const { handler, reader } = makeHandler([
      { courseId: 'a', title: 'A2', recipe: null },
      { courseId: 'b', title: 'B1', recipe: RECIPE_PRESETS.exam_b1 },
      { courseId: 'c', title: 'Drift', recipe: { rules: [] } },
      { courseId: 'd', title: 'IT', recipe: null },
    ]);

    const result = await handler.execute(new GetWorkspaceRecipeCoursesQuery('school-1'));

    expect(reader.listForSchool).toHaveBeenCalledWith('school-1');
    expect(result).toEqual({
      total: 4,
      follow: 2,
      own: 1,
      none: 1,
      exceptions: [
        { courseId: 'b', title: 'B1', mode: 'own', ruleCount: 4 },
        { courseId: 'c', title: 'Drift', mode: 'none', ruleCount: 0 },
      ],
    });
  });

  it('answers zeros for a workspace without courses', async () => {
    const { handler } = makeHandler([]);

    const result = await handler.execute(new GetWorkspaceRecipeCoursesQuery('school-1'));

    expect(result).toEqual({ total: 0, follow: 0, own: 0, none: 0, exceptions: [] });
  });
});
