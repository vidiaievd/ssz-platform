import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateContainerCommand } from '../../application/commands/create-container/create-container.command.js';
import type { CreateContainerResult } from '../../application/commands/create-container/create-container.handler.js';
import { UpdateContainerCommand } from '../../application/commands/update-container/update-container.command.js';
import { DeleteContainerCommand } from '../../application/commands/delete-container/delete-container.command.js';
import { ArchiveContainerCommand } from '../../application/commands/archive-container/archive-container.command.js';
import { RestoreContainerCommand } from '../../application/commands/restore-container/restore-container.command.js';
import { UnpublishVersionCommand } from '../../application/commands/unpublish-version/unpublish-version.command.js';
import { CreateDraftFromPublishedCommand } from '../../application/commands/create-draft-from-published/create-draft-from-published.command.js';
import { CreateLocalizationCommand } from '../../application/commands/create-localization/create-localization.command.js';
import { UpdateLocalizationCommand } from '../../application/commands/update-localization/update-localization.command.js';
import { DeleteLocalizationCommand } from '../../application/commands/delete-localization/delete-localization.command.js';
import { GetContainerQuery } from '../../application/queries/get-container/get-container.query.js';
import type { GetContainerResult } from '../../application/queries/get-container/get-container.handler.js';
import { GetContainersQuery } from '../../application/queries/get-containers/get-containers.query.js';
import { GetContainerBySlugQuery } from '../../application/queries/get-container-by-slug/get-container-by-slug.query.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { PaginatedResult } from '../../../../shared/discovery/domain/types/pagination.js';
import type { ContainerDomainError } from '../../domain/exceptions/container-domain.exceptions.js';
import type { ContainerEntity } from '../../domain/entities/container.entity.js';
import { ContainerResponseDto } from '../dto/responses/container.response.dto.js';
import { ContainerLocalizationResponseDto } from '../dto/responses/container-localization.response.dto.js';
import { PaginatedResponseDto } from '../dto/responses/paginated.response.dto.js';
import { ApiPaginatedResponse } from '../../../../shared/discovery/presentation/decorators/api-paginated-response.decorator.js';
import { CreateContainerRequestDto } from '../dto/requests/create-container.request.dto.js';
import { UpdateContainerRequestDto } from '../dto/requests/update-container.request.dto.js';
import { ContainerListQueryDto } from '../dto/requests/container-list-query.dto.js';
import { CreateLocalizationRequestDto } from '../dto/requests/create-localization.request.dto.js';
import { UpdateLocalizationRequestDto } from '../dto/requests/update-localization.request.dto.js';
import { GetContainerActivityQuery } from '../../application/queries/get-container-activity/get-container-activity.query.js';
import type { ContainerActivityResult } from '../../application/queries/get-container-activity/get-container-activity.handler.js';
import { ContainerActivityResponseDto } from '../dto/responses/container-activity.response.dto.js';
import { GetContainerCoverageQuery } from '../../application/queries/get-container-coverage/get-container-coverage.query.js';
import type { CoverageVersionScope } from '../../application/queries/get-container-coverage/get-container-coverage.query.js';
import type { ContainerCoverageResult } from '../../application/queries/get-container-coverage/get-container-coverage.handler.js';
import { ContainerCoverageResponseDto } from '../dto/responses/coverage.response.dto.js';
import { throwHttpException } from '../utils/domain-error.mapper.js';
import { GetContainerReviewSettingsQuery } from '../../application/queries/get-review-settings/get-container-review-settings.query.js';
import type { ContainerReviewSettingsResult } from '../../application/queries/get-review-settings/get-container-review-settings.handler.js';
import { SetContainerReviewSettingsCommand } from '../../application/commands/set-review-settings/set-container-review-settings.command.js';
import { SetContainerReviewSettingsRequestDto } from '../dto/requests/review-settings.request.dto.js';
import { ContainerReviewSettingsResponseDto } from '../dto/responses/review-settings.response.dto.js';

@ApiTags('Containers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('containers')
export class ContainerController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new container with an initial draft version' })
  @ApiCreatedResponse({ type: ContainerResponseDto })
  async create(
    @Body() dto: CreateContainerRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContainerResponseDto> {
    const result = await this.commandBus.execute<
      CreateContainerCommand,
      Result<CreateContainerResult, ContainerDomainError>
    >(
      new CreateContainerCommand(
        user.userId,
        dto.containerType,
        dto.targetLanguage,
        dto.difficultyLevel,
        dto.title,
        dto.visibility,
        dto.description,
        dto.coverImageMediaId,
        dto.ownerSchoolId,
        dto.accessTier,
        dto.levelSystem,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    const { container } = result.value;
    return ContainerResponseDto.from(container);
  }

  @Get()
  @ApiOperation({ summary: 'List containers with optional filters, sorting, and pagination' })
  @ApiPaginatedResponse(ContainerResponseDto)
  async findAll(
    @Query() dto: ContainerListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<ContainerResponseDto>> {
    const paged = await this.queryBus.execute<GetContainersQuery, PaginatedResult<ContainerEntity>>(
      new GetContainersQuery(dto, user),
    );

    return new PaginatedResponseDto({
      items: paged.items.map((c) => ContainerResponseDto.from(c)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a published container by its URL slug' })
  @ApiOkResponse({ type: ContainerResponseDto })
  async findBySlug(@Param('slug') slug: string): Promise<ContainerResponseDto> {
    const result = await this.queryBus.execute<
      GetContainerBySlugQuery,
      Result<ContainerEntity, ContainerDomainError>
    >(new GetContainerBySlugQuery(slug));

    if (result.isFail) throwHttpException(result.error);
    return ContainerResponseDto.from(result.value);
  }

  @Get(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.CONTAINER })
  @ApiOperation({ summary: 'Get a container by ID' })
  @ApiOkResponse({ type: ContainerResponseDto })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContainerResponseDto> {
    const result = await this.queryBus.execute<
      GetContainerQuery,
      Result<GetContainerResult, ContainerDomainError>
    >(new GetContainerQuery(id, user.userId));

    if (result.isFail) throwHttpException(result.error);
    const { container, localizations } = result.value;
    return ContainerResponseDto.from(container, localizations);
  }

  /**
   * Whether the caller may edit this container — a question, not a document.
   *
   * The course-level twin of `GET /exercises/:id/edit-access`, and it exists for the same
   * caller: the web BFF opening a marking queue that lives in exercise-engine, which knows
   * nothing about who owns a course. Asked once per course, it is what keeps the course
   * inbox from being one access check per exercise in it — the exercises come out of this
   * container's own tree, so the right to edit the course carries to all of them.
   *
   * `VisibilityGuard` answers by refusing the request, so a 200 *is* the answer.
   */
  @Get(':id/edit-access')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @ApiOperation({ summary: 'Check whether the caller may edit this container' })
  @ApiOkResponse({ description: '{ canEdit: true } — a refusal arrives as 403 or 404' })
  checkEditAccess(): { canEdit: true } {
    return { canEdit: true };
  }

  @Get(':id/activity')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.CONTAINER })
  @ApiOperation({
    summary: 'Who changed this container and the material it places, newest first',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size, 1–100. Default 30.' })
  @ApiQuery({
    name: 'before',
    required: false,
    description:
      'ISO 8601. Returns entries older than this instant — pass the `occurredAt` of the ' +
      'last entry received to page backwards.',
  })
  @ApiOkResponse({ type: ContainerActivityResponseDto })
  async activity(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<ContainerActivityResponseDto> {
    // Parsed here rather than by a validation pipe: both are optional scalars with
    // an obvious fallback, and a rejected page size helps nobody.
    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const size = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 30;
    const cursor = before ? new Date(before) : undefined;

    const result = await this.queryBus.execute<GetContainerActivityQuery, ContainerActivityResult>(
      new GetContainerActivityQuery(
        id,
        size,
        cursor && !Number.isNaN(cursor.getTime()) ? cursor : undefined,
      ),
    );

    return ContainerActivityResponseDto.from(result);
  }

  /**
   * How long a learner of this course waits for a person to answer their work.
   *
   * Always reports the school's promise beside the course's own, so that "inherited" is a
   * number on the screen rather than a blank (criterion 35).
   */
  /**
   * What this course actually trains, and what it never touches.
   *
   * Counted on demand, with nothing stored: coverage is a property of the content, and
   * the only service that knows what a module is made of is this one.
   */
  @Get(':id/coverage')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.CONTAINER })
  @ApiOperation({ summary: 'The skills, subjects and answer forms this container trains' })
  @ApiQuery({
    name: 'version',
    required: false,
    enum: ['draft', 'published', 'both'],
    description:
      'Which composition to count. `draft` (default) is what the author is editing; ' +
      '`published` is what learners have; `both` returns each of them and says whether ' +
      'they disagree. A container with no unreleased changes reports `diverges: false`.',
  })
  @ApiOkResponse({ type: ContainerCoverageResponseDto })
  async coverage(
    @Param('id') id: string,
    @Query('version') version?: string,
  ): Promise<ContainerCoverageResponseDto> {
    const scope: CoverageVersionScope =
      version === 'published' || version === 'both' ? version : 'draft';

    const result = await this.queryBus.execute<
      GetContainerCoverageQuery,
      Result<ContainerCoverageResult, ContainerDomainError>
    >(new GetContainerCoverageQuery(id, scope));

    if (result.isFail) throwHttpException(result.error);
    return ContainerCoverageResponseDto.from(result.value);
  }

  @Get(':id/review-settings')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.CONTAINER })
  @ApiOperation({ summary: 'The response time this course promises, and the one it inherits' })
  @ApiOkResponse({ type: ContainerReviewSettingsResponseDto })
  async getReviewSettings(@Param('id') id: string): Promise<ContainerReviewSettingsResponseDto> {
    const result = await this.queryBus.execute<
      GetContainerReviewSettingsQuery,
      Result<ContainerReviewSettingsResult, ContainerDomainError>
    >(new GetContainerReviewSettingsQuery(id));

    if (result.isFail) throwHttpException(result.error);
    return ContainerReviewSettingsResponseDto.from(result.value);
  }

  /** `null` gives the promise back to the school; the response says what applies now. */
  @Put(':id/review-settings')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @ApiOperation({ summary: 'Set or clear this course’s own response time' })
  @ApiOkResponse({ type: ContainerReviewSettingsResponseDto })
  async setReviewSettings(
    @Param('id') id: string,
    @Body() dto: SetContainerReviewSettingsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContainerReviewSettingsResponseDto> {
    const applied = await this.commandBus.execute<
      SetContainerReviewSettingsCommand,
      Result<void, ContainerDomainError>
    >(new SetContainerReviewSettingsCommand(user.userId, id, dto.respondWithinHours));

    if (applied.isFail) throwHttpException(applied.error);

    const result = await this.queryBus.execute<
      GetContainerReviewSettingsQuery,
      Result<ContainerReviewSettingsResult, ContainerDomainError>
    >(new GetContainerReviewSettingsQuery(id));

    if (result.isFail) throwHttpException(result.error);
    return ContainerReviewSettingsResponseDto.from(result.value);
  }

  @Patch(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update container metadata' })
  @ApiNoContentResponse()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContainerRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateContainerCommand,
      Result<void, ContainerDomainError>
    >(
      new UpdateContainerCommand(
        user.userId,
        id,
        dto.title,
        dto.description,
        dto.difficultyLevel,
        dto.coverImageMediaId,
        dto.visibility,
        dto.accessTier,
        dto.levelSystem,
        dto.gatingMode,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a container' })
  @ApiNoContentResponse()
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteContainerCommand,
      Result<void, ContainerDomainError>
    >(new DeleteContainerCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/archive')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a course (reversible) — hides it from the catalogue' })
  @ApiNoContentResponse()
  async archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const result = await this.commandBus.execute<
      ArchiveContainerCommand,
      Result<void, ContainerDomainError>
    >(new ArchiveContainerCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/restore')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore a previously archived course' })
  @ApiNoContentResponse()
  async restore(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const result = await this.commandBus.execute<
      RestoreContainerCommand,
      Result<void, ContainerDomainError>
    >(new RestoreContainerCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/unpublish')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unpublish the current published version back to draft' })
  @ApiNoContentResponse()
  async unpublish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const result = await this.commandBus.execute<
      UnpublishVersionCommand,
      Result<void, ContainerDomainError>
    >(new UnpublishVersionCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
  }

  @Post(':id/draft')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @ApiOperation({ summary: 'Create a new draft by copying the current published version' })
  @ApiCreatedResponse({ description: 'Returns the new draft version ID' })
  async createDraft(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ versionId: string }> {
    const result = await this.commandBus.execute<
      CreateDraftFromPublishedCommand,
      Result<{ versionId: string }, ContainerDomainError>
    >(new CreateDraftFromPublishedCommand(user.userId, id));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Post(':id/localizations')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @ApiOperation({ summary: 'Add a localization (translated title/description) for a container' })
  @ApiCreatedResponse({ type: ContainerLocalizationResponseDto })
  async createLocalization(
    @Param('id') id: string,
    @Body() dto: CreateLocalizationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ localizationId: string }> {
    const result = await this.commandBus.execute<
      CreateLocalizationCommand,
      Result<{ localizationId: string }, ContainerDomainError>
    >(new CreateLocalizationCommand(user.userId, id, dto.languageCode, dto.title, dto.description));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Patch(':id/localizations/:languageCode')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update an existing localization' })
  @ApiNoContentResponse()
  async updateLocalization(
    @Param('id') id: string,
    @Param('languageCode') languageCode: string,
    @Body() dto: UpdateLocalizationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateLocalizationCommand,
      Result<void, ContainerDomainError>
    >(new UpdateLocalizationCommand(user.userId, id, languageCode, dto.title, dto.description));

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':id/localizations/:languageCode')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.CONTAINER })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a localization' })
  @ApiNoContentResponse()
  async deleteLocalization(
    @Param('id') id: string,
    @Param('languageCode') languageCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteLocalizationCommand,
      Result<void, ContainerDomainError>
    >(new DeleteLocalizationCommand(user.userId, id, languageCode));

    if (result.isFail) throwHttpException(result.error);
  }
}
