import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Recipe } from '@ssz/shared-kernel/skills';
import { GetWorkspaceRecipeQuery } from './get-workspace-recipe.query.js';
import {
  WORKSPACE_COVERAGE_RECIPE_REPOSITORY,
  type IWorkspaceCoverageRecipeRepository,
} from '../../../domain/repositories/workspace-coverage-recipe.repository.interface.js';

export interface WorkspaceRecipeResult {
  schoolId: string;
  /** Null when the workspace has set none — distinct from an empty recipe it chose. */
  recipe: Recipe | null;
  updatedAt: Date | null;
}

@QueryHandler(GetWorkspaceRecipeQuery)
export class GetWorkspaceRecipeHandler implements IQueryHandler<GetWorkspaceRecipeQuery> {
  constructor(
    @Inject(WORKSPACE_COVERAGE_RECIPE_REPOSITORY)
    private readonly recipes: IWorkspaceCoverageRecipeRepository,
  ) {}

  async execute(query: GetWorkspaceRecipeQuery): Promise<WorkspaceRecipeResult> {
    const found = await this.recipes.findBySchoolId(query.schoolId);
    return {
      schoolId: query.schoolId,
      recipe: found?.recipe ?? null,
      updatedAt: found?.updatedAt ?? null,
    };
  }
}
