import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { WORKSPACE_COVERAGE_RECIPE_REPOSITORY } from './domain/repositories/workspace-coverage-recipe.repository.interface.js';
import { PrismaWorkspaceCoverageRecipeRepository } from './infrastructure/persistence/prisma-workspace-coverage-recipe.repository.js';
import { GetWorkspaceRecipeHandler } from './application/queries/get-workspace-recipe/get-workspace-recipe.handler.js';
import { SetWorkspaceRecipeHandler } from './application/commands/set-workspace-recipe/set-workspace-recipe.handler.js';
import { WorkspaceCoverageRecipeController } from './presentation/controllers/workspace-coverage-recipe.controller.js';
import { WorkspaceRoleGuard } from './presentation/guards/workspace-role.guard.js';

/**
 * The workspace half of the lesson recipe (plan 64, decision O). The course half — an
 * override on the course — lives on `ContainerEntity`, which reads the repository
 * exported here to report what a course inherits.
 */
@Module({
  imports: [CqrsModule],
  controllers: [WorkspaceCoverageRecipeController],
  providers: [
    {
      provide: WORKSPACE_COVERAGE_RECIPE_REPOSITORY,
      useClass: PrismaWorkspaceCoverageRecipeRepository,
    },
    WorkspaceRoleGuard,
    GetWorkspaceRecipeHandler,
    SetWorkspaceRecipeHandler,
  ],
  exports: [WORKSPACE_COVERAGE_RECIPE_REPOSITORY],
})
export class CoverageRecipeModule {}
