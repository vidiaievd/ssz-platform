import type { WorkspaceCoverageRecipeEntity } from '../entities/workspace-coverage-recipe.entity.js';

export const WORKSPACE_COVERAGE_RECIPE_REPOSITORY = Symbol('IWorkspaceCoverageRecipeRepository');

export interface IWorkspaceCoverageRecipeRepository {
  /** Null when the workspace has set no recipe. */
  findBySchoolId(schoolId: string): Promise<WorkspaceCoverageRecipeEntity | null>;
  /** Insert or replace — a workspace has one recipe. */
  save(entity: WorkspaceCoverageRecipeEntity): Promise<void>;
}
