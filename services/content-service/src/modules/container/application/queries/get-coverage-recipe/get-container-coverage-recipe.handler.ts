import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EMPTY_RECIPE, type Recipe } from '@ssz/shared-kernel/skills';
import { GetContainerCoverageRecipeQuery } from './get-container-coverage-recipe.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import {
  CONTAINER_REPOSITORY,
  type IContainerRepository,
} from '../../../domain/repositories/container.repository.interface.js';
import {
  WORKSPACE_COVERAGE_RECIPE_REPOSITORY,
  type IWorkspaceCoverageRecipeRepository,
} from '../../../../coverage-recipe/domain/repositories/workspace-coverage-recipe.repository.interface.js';

export interface ContainerCoverageRecipeResult {
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
 * The course's recipe and the one behind it, side by side — the shape of the response
 * promise (plan 44, criterion 35) and for the same reason: an author deciding whether to
 * depart from the workspace needs to see what they would depart from.
 *
 * A course with no school inherits nothing (decision of 02.10.2026): a tutor's courses
 * are not tied to their SOLO workspace yet, and guessing the workspace from the owner
 * would be a second, temporary rule. They keep their own recipe on the course.
 */
@QueryHandler(GetContainerCoverageRecipeQuery)
export class GetContainerCoverageRecipeHandler implements IQueryHandler<GetContainerCoverageRecipeQuery> {
  constructor(
    @Inject(CONTAINER_REPOSITORY) private readonly containers: IContainerRepository,
    @Inject(WORKSPACE_COVERAGE_RECIPE_REPOSITORY)
    private readonly workspaces: IWorkspaceCoverageRecipeRepository,
  ) {}

  async execute(
    query: GetContainerCoverageRecipeQuery,
  ): Promise<Result<ContainerCoverageRecipeResult, ContainerDomainError>> {
    const container = await this.containers.findById(query.containerId);
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    const inherited = container.ownerSchoolId
      ? ((await this.workspaces.findBySchoolId(container.ownerSchoolId))?.recipe ?? null)
      : null;

    const own = container.coverageRecipe;
    return Result.ok({
      recipe: own ?? inherited ?? EMPTY_RECIPE,
      inherited,
      overridden: own !== null,
    });
  }
}
