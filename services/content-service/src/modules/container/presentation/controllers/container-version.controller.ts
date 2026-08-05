import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { PublishVersionCommand } from '../../application/commands/publish-version/publish-version.command.js';
import { RollbackToVersionCommand } from '../../application/commands/rollback-to-version/rollback-to-version.command.js';
import { CancelDraftCommand } from '../../application/commands/cancel-draft/cancel-draft.command.js';
import { ArchiveVersionCommand } from '../../application/commands/archive-version/archive-version.command.js';
import { GetContainerVersionsQuery } from '../../application/queries/get-container-versions/get-container-versions.query.js';
import { GetContainerVersionQuery } from '../../application/queries/get-container-version/get-container-version.query.js';
import { GetCurriculumTreeQuery } from '../../application/queries/get-curriculum-tree/get-curriculum-tree.query.js';
import type { CurriculumTreeResult } from '../../application/queries/get-curriculum-tree/get-curriculum-tree.handler.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { ContainerDomainError } from '../../domain/exceptions/container-domain.exceptions.js';
import type { ContainerVersionEntity } from '../../domain/entities/container-version.entity.js';
import type { PaginatedResult } from '../../../../shared/discovery/domain/types/pagination.js';
import { PaginatedResponseDto } from '../../../../shared/discovery/presentation/dto/paginated-response.dto.js';
import { ApiPaginatedResponse } from '../../../../shared/discovery/presentation/decorators/api-paginated-response.decorator.js';
import { ContainerVersionResponseDto } from '../dto/responses/container-version.response.dto.js';
import { CurriculumTreeResponseDto } from '../dto/responses/curriculum-tree.response.dto.js';
import { ContainerVersionsQueryDto } from '../dto/requests/container-versions-query.dto.js';
import { PublishVersionRequestDto } from '../dto/requests/publish-version.request.dto.js';
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Container Versions')
@ApiBearerAuth()
@ApiParam({ name: 'containerId', type: String, description: 'Container ID' })
@UseGuards(JwtAuthGuard)
@Controller('containers/:containerId/versions')
export class ContainerVersionController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @ApiOperation({ summary: 'List versions for a container with optional filters and pagination' })
  @ApiPaginatedResponse(ContainerVersionResponseDto)
  async findAll(
    @Param('containerId') containerId: string,
    @Query() dto: ContainerVersionsQueryDto,
  ): Promise<PaginatedResponseDto<ContainerVersionResponseDto>> {
    const paged = await this.queryBus.execute<
      GetContainerVersionsQuery,
      PaginatedResult<ContainerVersionEntity>
    >(new GetContainerVersionsQuery(containerId, dto));

    return new PaginatedResponseDto({
      items: paged.items.map((v) => ContainerVersionResponseDto.from(v)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get(':versionId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @ApiOperation({ summary: 'Get a specific version by ID' })
  @ApiOkResponse({ type: ContainerVersionResponseDto })
  async findOne(@Param('versionId') versionId: string): Promise<ContainerVersionResponseDto> {
    const result = await this.queryBus.execute<
      GetContainerVersionQuery,
      Result<ContainerVersionEntity, ContainerDomainError>
    >(new GetContainerVersionQuery(versionId));

    if (result.isFail) throwHttpException(result.error);
    return ContainerVersionResponseDto.from(result.value);
  }

  @Get(':versionId/tree')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @ApiOperation({
    summary:
      'Get the full editable curriculum tree for a version: levels → modules → sections → items',
  })
  @ApiOkResponse({ type: CurriculumTreeResponseDto })
  async getTree(@Param('versionId') versionId: string): Promise<CurriculumTreeResponseDto> {
    const result = await this.queryBus.execute<
      GetCurriculumTreeQuery,
      Result<CurriculumTreeResult, ContainerDomainError>
    >(new GetCurriculumTreeQuery(versionId));

    if (result.isFail) throwHttpException(result.error);
    return CurriculumTreeResponseDto.from(result.value);
  }

  @Post(':versionId/publish')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @ApiOperation({ summary: 'Publish a draft version, deprecating the currently published one' })
  @ApiCreatedResponse({ description: 'Version published successfully' })
  async publish(
    @Param('versionId') versionId: string,
    @Body() dto: PublishVersionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ versionId: string }> {
    const result = await this.commandBus.execute<
      PublishVersionCommand,
      Result<{ versionId: string }, ContainerDomainError>
    >(new PublishVersionCommand(user.userId, versionId, dto.deprecationDays, dto.changelog));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Post(':versionId/rollback')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @ApiOperation({
    summary: 'Put a deprecated version back on air, deprecating the currently published one',
  })
  @ApiCreatedResponse({ description: 'Version is live again' })
  async rollback(
    @Param('containerId') containerId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ versionId: string }> {
    const result = await this.commandBus.execute<
      RollbackToVersionCommand,
      Result<{ versionId: string }, ContainerDomainError>
    >(new RollbackToVersionCommand(user.userId, containerId, versionId));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Delete(':versionId/cancel')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER, idParam: 'containerId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel (delete) a draft version' })
  @ApiNoContentResponse()
  async cancelDraft(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      CancelDraftCommand,
      Result<void, ContainerDomainError>
    >(new CancelDraftCommand(user.userId, versionId));

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':versionId/archive')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  // TODO(block-5-followup): gate with InternalAuthGuard once implemented.
  // Currently protected only by @Public() — acceptable for dev/staging.
  @ApiOperation({
    summary: 'Archive a deprecated version (internal service-to-service endpoint)',
  })
  @ApiNoContentResponse()
  async archive(@Param('versionId') versionId: string): Promise<void> {
    const result = await this.commandBus.execute<
      ArchiveVersionCommand,
      Result<void, ContainerDomainError>
    >(new ArchiveVersionCommand(versionId));

    if (result.isFail) throwHttpException(result.error);
  }
}
