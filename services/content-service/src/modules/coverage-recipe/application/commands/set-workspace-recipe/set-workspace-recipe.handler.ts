import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SetWorkspaceRecipeCommand } from './set-workspace-recipe.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { WorkspaceCoverageRecipeEntity } from '../../../domain/entities/workspace-coverage-recipe.entity.js';
import type { CoverageRecipeDomainError } from '../../../domain/exceptions/coverage-recipe-domain.exceptions.js';
import {
  WORKSPACE_COVERAGE_RECIPE_REPOSITORY,
  type IWorkspaceCoverageRecipeRepository,
} from '../../../domain/repositories/workspace-coverage-recipe.repository.interface.js';

/**
 * Who may set it is settled at the edge by `WorkspaceRoleGuard`.
 *
 * Not written to the audit log: `audit_entity_type` names content entities, and a
 * workspace is not one. The row itself keeps who changed it last.
 */
@CommandHandler(SetWorkspaceRecipeCommand)
export class SetWorkspaceRecipeHandler implements ICommandHandler<SetWorkspaceRecipeCommand> {
  constructor(
    @Inject(WORKSPACE_COVERAGE_RECIPE_REPOSITORY)
    private readonly recipes: IWorkspaceCoverageRecipeRepository,
  ) {}

  async execute(
    command: SetWorkspaceRecipeCommand,
  ): Promise<Result<void, CoverageRecipeDomainError>> {
    const written = WorkspaceCoverageRecipeEntity.write(
      command.schoolId,
      command.recipe,
      command.userId,
    );
    if (written.isFail) return Result.fail(written.error);

    await this.recipes.save(written.value);
    return Result.ok();
  }
}
