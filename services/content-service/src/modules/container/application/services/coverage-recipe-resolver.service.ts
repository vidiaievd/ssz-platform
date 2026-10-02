import { Inject, Injectable } from '@nestjs/common';
import { EMPTY_RECIPE, type Recipe } from '@ssz/shared-kernel/skills';
import {
  WORKSPACE_COVERAGE_RECIPE_REPOSITORY,
  type IWorkspaceCoverageRecipeRepository,
} from '../../../coverage-recipe/domain/repositories/workspace-coverage-recipe.repository.interface.js';

export interface ResolvedCoverageRecipe {
  /** What the lessons are checked against: the override, else the workspace's, else empty. */
  recipe: Recipe;
  /**
   * The workspace's recipe — what "inherit" means for this course. Null when the course
   * belongs to no school, or its school has set none.
   */
  inherited: Recipe | null;
  overridden: boolean;
}

/**
 * Which recipe a course's lessons are held to (plan 64, decision O).
 *
 * One place for the chain — the course's own, then its workspace's, then none — so that
 * the recipe editor and the coverage report can never disagree about which rules apply.
 *
 * A course with no school inherits nothing (decision of 02.10.2026): a tutor's courses
 * are not tied to their SOLO workspace yet, and guessing the workspace from the owner
 * would be a second, temporary rule. They keep their own recipe on the course.
 */
@Injectable()
export class CoverageRecipeResolver {
  constructor(
    @Inject(WORKSPACE_COVERAGE_RECIPE_REPOSITORY)
    private readonly workspaces: IWorkspaceCoverageRecipeRepository,
  ) {}

  async resolve(course: {
    ownerSchoolId: string | null;
    coverageRecipe: Recipe | null;
  }): Promise<ResolvedCoverageRecipe> {
    const inherited = course.ownerSchoolId
      ? ((await this.workspaces.findBySchoolId(course.ownerSchoolId))?.recipe ?? null)
      : null;

    const own = course.coverageRecipe;
    return {
      recipe: own ?? inherited ?? EMPTY_RECIPE,
      inherited,
      overridden: own !== null,
    };
  }
}
