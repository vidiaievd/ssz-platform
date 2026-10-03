import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import { CoverageRecipeDomainError } from '../../domain/exceptions/coverage-recipe-domain.exceptions.js';
import { GetWorkspaceRecipeQuery } from '../../application/queries/get-workspace-recipe/get-workspace-recipe.query.js';
import type { WorkspaceRecipeResult } from '../../application/queries/get-workspace-recipe/get-workspace-recipe.handler.js';
import { SetWorkspaceRecipeCommand } from '../../application/commands/set-workspace-recipe/set-workspace-recipe.command.js';
import { SetWorkspaceRecipeRequestDto } from '../dto/requests/set-workspace-recipe.request.dto.js';
import { WorkspaceRecipeResponseDto } from '../dto/responses/workspace-recipe.response.dto.js';
import { WorkspaceRecipeCoursesResponseDto } from '../dto/responses/workspace-recipe-courses.response.dto.js';
import { GetWorkspaceRecipeCoursesQuery } from '../../application/queries/get-workspace-recipe-courses/get-workspace-recipe-courses.query.js';
import type { WorkspaceRecipeCoursesResult } from '../../application/queries/get-workspace-recipe-courses/get-workspace-recipe-courses.handler.js';
import { RequireWorkspaceAccess, WorkspaceRoleGuard } from '../guards/workspace-role.guard.js';

/**
 * `coverage-recipes/workspaces/:schoolId` rather than `workspaces/:id/...`: the
 * `/api/v1/workspaces` prefix belongs to organization-service at the gateway.
 */
@ApiTags('Coverage recipes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('coverage-recipes/workspaces')
export class WorkspaceCoverageRecipeController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':schoolId')
  @RequireWorkspaceAccess('view')
  @ApiOperation({ summary: 'The recipe a workspace expects every lesson to meet' })
  @ApiOkResponse({ type: WorkspaceRecipeResponseDto })
  @ApiForbiddenResponse({ description: 'Not a teacher or editor of this workspace' })
  async get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<WorkspaceRecipeResponseDto> {
    const result = await this.queryBus.execute<GetWorkspaceRecipeQuery, WorkspaceRecipeResult>(
      new GetWorkspaceRecipeQuery(schoolId),
    );
    return WorkspaceRecipeResponseDto.from(result);
  }

  @Get(':schoolId/courses')
  @RequireWorkspaceAccess('view')
  @ApiOperation({ summary: 'How the workspace’s courses use its recipe' })
  @ApiOkResponse({ type: WorkspaceRecipeCoursesResponseDto })
  @ApiForbiddenResponse({ description: 'Not a teacher or editor of this workspace' })
  async courses(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<WorkspaceRecipeCoursesResponseDto> {
    const result = await this.queryBus.execute<
      GetWorkspaceRecipeCoursesQuery,
      WorkspaceRecipeCoursesResult
    >(new GetWorkspaceRecipeCoursesQuery(schoolId));
    return WorkspaceRecipeCoursesResponseDto.from(result);
  }

  @Put(':schoolId')
  @RequireWorkspaceAccess('edit')
  @ApiOperation({ summary: 'Replace the workspace’s recipe' })
  @ApiOkResponse({ type: WorkspaceRecipeResponseDto })
  @ApiBadRequestResponse({ description: 'INVALID_COVERAGE_RECIPE — a rule does not parse' })
  @ApiForbiddenResponse({ description: 'Not an owner or content admin of this workspace' })
  async set(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: SetWorkspaceRecipeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WorkspaceRecipeResponseDto> {
    const applied = await this.commandBus.execute<
      SetWorkspaceRecipeCommand,
      Result<void, CoverageRecipeDomainError>
    >(new SetWorkspaceRecipeCommand(user.userId, schoolId, dto.recipe));
    if (applied.isFail) throw new BadRequestException(applied.error);

    return this.get(schoolId);
  }
}
