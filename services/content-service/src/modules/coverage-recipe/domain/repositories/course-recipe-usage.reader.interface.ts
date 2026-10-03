import type { Recipe } from '@ssz/shared-kernel/skills';

export const COURSE_RECIPE_USAGE_READER = Symbol('ICourseRecipeUsageReader');

/** One live course of a workspace and the recipe it keeps on itself, if any. */
export interface CourseRecipeUsage {
  courseId: string;
  title: string;
  /** Null: the course follows the workspace. `{ rules: [] }`: it opted out. */
  recipe: Recipe | null;
}

/**
 * The courses a workspace's recipe reaches — plan 65, phase 5.
 *
 * Read-only and course-shaped on purpose: the settings page only needs to say how many
 * courses follow the workspace and which ones do not, never to change them.
 */
export interface ICourseRecipeUsageReader {
  /** The school's courses that are neither deleted nor archived, by title. */
  listForSchool(schoolId: string): Promise<CourseRecipeUsage[]>;
}
