import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetWorkspaceRecipeCoursesQuery } from './get-workspace-recipe-courses.query.js';
import {
  COURSE_RECIPE_USAGE_READER,
  type ICourseRecipeUsageReader,
} from '../../../domain/repositories/course-recipe-usage.reader.interface.js';

export interface CourseRecipeException {
  courseId: string;
  title: string;
  mode: 'own' | 'none';
  /** Rules of the course's own recipe; 0 for a course that uses none. */
  ruleCount: number;
}

export interface WorkspaceRecipeCoursesResult {
  total: number;
  /** Courses that follow the workspace's recipe. */
  follow: number;
  /** Courses with a recipe of their own. */
  own: number;
  /** Courses that opted out of any recipe. */
  none: number;
  /** The courses that do not follow, in title order. */
  exceptions: CourseRecipeException[];
}

/**
 * The three states of a course's recipe — the ones its settings drawer offers — counted
 * across a workspace (plan 65, phase 5). A course without a school is not one of them:
 * it inherits nothing, so it is not part of this workspace's picture.
 */
@QueryHandler(GetWorkspaceRecipeCoursesQuery)
export class GetWorkspaceRecipeCoursesHandler implements IQueryHandler<GetWorkspaceRecipeCoursesQuery> {
  constructor(
    @Inject(COURSE_RECIPE_USAGE_READER)
    private readonly courses: ICourseRecipeUsageReader,
  ) {}

  async execute(query: GetWorkspaceRecipeCoursesQuery): Promise<WorkspaceRecipeCoursesResult> {
    const courses = await this.courses.listForSchool(query.schoolId);

    const exceptions: CourseRecipeException[] = courses.flatMap((course) =>
      course.recipe === null
        ? []
        : [
            {
              courseId: course.courseId,
              title: course.title,
              mode: course.recipe.rules.length === 0 ? ('none' as const) : ('own' as const),
              ruleCount: course.recipe.rules.length,
            },
          ],
    );
    const none = exceptions.filter((e) => e.mode === 'none').length;

    return {
      total: courses.length,
      follow: courses.length - exceptions.length,
      own: exceptions.length - none,
      none,
      exceptions,
    };
  }
}
