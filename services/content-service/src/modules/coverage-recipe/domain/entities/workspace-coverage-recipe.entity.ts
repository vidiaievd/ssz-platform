import { readRecipe, type Recipe } from '@ssz/shared-kernel/skills';
import { Result } from '../../../../shared/kernel/result.js';
import { CoverageRecipeDomainError } from '../exceptions/coverage-recipe-domain.exceptions.js';

interface WorkspaceCoverageRecipeProps {
  recipe: Recipe;
  updatedAt: Date;
  updatedByUserId: string;
}

/**
 * A workspace's standard for what a lesson should train — plan 64, decision O.
 *
 * Keyed by the school's id and nothing else: SCHOOL and SOLO workspaces are both rows of
 * `schools` in organization-service, so one key covers a school and a tutor alike. There
 * is no "unset" state on the entity — a workspace without a standard has no row, and an
 * empty recipe is a standard that asks for nothing, which is a choice a workspace may make.
 */
export class WorkspaceCoverageRecipeEntity {
  private constructor(
    readonly schoolId: string,
    private props: WorkspaceCoverageRecipeProps,
  ) {}

  get recipe(): Recipe {
    return this.props.recipe;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get updatedByUserId(): string {
    return this.props.updatedByUserId;
  }

  /**
   * A recipe as the author sent it. Strict: one rule that does not parse refuses the
   * whole recipe rather than storing a shorter one than they wrote.
   */
  static write(
    schoolId: string,
    value: unknown,
    userId: string,
  ): Result<WorkspaceCoverageRecipeEntity, CoverageRecipeDomainError> {
    const recipe = readRecipe(value);
    if (!recipe) return Result.fail(CoverageRecipeDomainError.INVALID_COVERAGE_RECIPE);
    return Result.ok(
      new WorkspaceCoverageRecipeEntity(schoolId, {
        recipe,
        updatedAt: new Date(),
        updatedByUserId: userId,
      }),
    );
  }

  static reconstitute(
    schoolId: string,
    props: WorkspaceCoverageRecipeProps,
  ): WorkspaceCoverageRecipeEntity {
    return new WorkspaceCoverageRecipeEntity(schoolId, props);
  }
}
