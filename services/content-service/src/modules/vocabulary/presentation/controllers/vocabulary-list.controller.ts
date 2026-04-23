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
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';

// Commands
import { CreateVocabularyListCommand } from '../../application/commands/create-vocabulary-list/create-vocabulary-list.command.js';
import type { CreateVocabularyListResult } from '../../application/commands/create-vocabulary-list/create-vocabulary-list.handler.js';
import { UpdateVocabularyListCommand } from '../../application/commands/update-vocabulary-list/update-vocabulary-list.command.js';
import { DeleteVocabularyListCommand } from '../../application/commands/delete-vocabulary-list/delete-vocabulary-list.command.js';

// Queries
import { GetVocabularyListsQuery } from '../../application/queries/get-vocabulary-lists/get-vocabulary-lists.query.js';
import { GetVocabularyListQuery } from '../../application/queries/get-vocabulary-list/get-vocabulary-list.query.js';
import { GetVocabularyListBySlugQuery } from '../../application/queries/get-vocabulary-list-by-slug/get-vocabulary-list-by-slug.query.js';
import { GetVocabularyListItemsQuery } from '../../application/queries/get-vocabulary-list-items/get-vocabulary-list-items.query.js';

// Domain types
import type { VocabularyDomainError } from '../../domain/exceptions/vocabulary-domain.exceptions.js';
import type { VocabularyListEntity } from '../../domain/entities/vocabulary-list.entity.js';
import type { VocabularyItemEntity } from '../../domain/entities/vocabulary-item.entity.js';

// Request DTOs
import { CreateVocabularyListRequestDto } from '../dto/requests/create-vocabulary-list.request.dto.js';
import { UpdateVocabularyListRequestDto } from '../dto/requests/update-vocabulary-list.request.dto.js';
import { GetVocabularyListsFilterRequestDto } from '../dto/requests/get-vocabulary-lists-filter.request.dto.js';
import { GetVocabularyListItemsRequestDto } from '../dto/requests/get-vocabulary-list-items.request.dto.js';

// Response DTOs
import { VocabularyListResponseDto } from '../dto/responses/vocabulary-list.response.dto.js';
import { VocabularyItemSummaryResponseDto } from '../dto/responses/vocabulary-item-summary.response.dto.js';
import { PaginatedResponseDto } from '../../../container/presentation/dto/responses/paginated.response.dto.js';

// Error mapper
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Vocabulary Lists')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vocabulary-lists')
export class VocabularyListController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new vocabulary list' })
  @ApiCreatedResponse({ description: 'Returns the new list ID' })
  async create(
    @Body() dto: CreateVocabularyListRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ listId: string }> {
    const result = await this.commandBus.execute<
      CreateVocabularyListCommand,
      Result<CreateVocabularyListResult, VocabularyDomainError>
    >(
      new CreateVocabularyListCommand(
        user.userId,
        dto.targetLanguage,
        dto.difficultyLevel,
        dto.title,
        dto.visibility,
        dto.description,
        dto.coverImageMediaId,
        dto.ownerSchoolId,
        dto.autoAddToSrs,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List vocabulary lists with optional filters and pagination' })
  @ApiOkResponse({ type: PaginatedResponseDto })
  async findAll(
    @Query() filter: GetVocabularyListsFilterRequestDto,
  ): Promise<PaginatedResponseDto<VocabularyListResponseDto>> {
    const paged = await this.queryBus.execute<
      GetVocabularyListsQuery,
      PaginatedResult<VocabularyListEntity>
    >(
      new GetVocabularyListsQuery({
        targetLanguage: filter.targetLanguage,
        difficultyLevel: filter.difficultyLevel,
        visibility: filter.visibility,
        ownerUserId: filter.ownerUserId,
        ownerSchoolId: filter.ownerSchoolId,
        search: filter.search,
        page: filter.page ?? 1,
        limit: filter.limit ?? 20,
        sort: filter.sort,
      }),
    );

    return new PaginatedResponseDto({
      items: paged.items.map((l) => VocabularyListResponseDto.from(l)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
    });
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a public vocabulary list by its URL slug' })
  @ApiOkResponse({ type: VocabularyListResponseDto })
  async findBySlug(@Param('slug') slug: string): Promise<VocabularyListResponseDto> {
    const result = await this.queryBus.execute<
      GetVocabularyListBySlugQuery,
      Result<VocabularyListEntity, VocabularyDomainError>
    >(new GetVocabularyListBySlugQuery(slug));

    if (result.isFail) throwHttpException(result.error);
    return VocabularyListResponseDto.from(result.value);
  }

  @Get(':listId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @ApiOperation({ summary: 'Get a vocabulary list by ID' })
  @ApiOkResponse({ type: VocabularyListResponseDto })
  async findOne(@Param('listId') listId: string): Promise<VocabularyListResponseDto> {
    const result = await this.queryBus.execute<
      GetVocabularyListQuery,
      Result<VocabularyListEntity, VocabularyDomainError>
    >(new GetVocabularyListQuery(listId));

    if (result.isFail) throwHttpException(result.error);
    return VocabularyListResponseDto.from(result.value);
  }

  @Patch(':listId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update vocabulary list metadata' })
  @ApiNoContentResponse()
  async update(
    @Param('listId') listId: string,
    @Body() dto: UpdateVocabularyListRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateVocabularyListCommand,
      Result<void, VocabularyDomainError>
    >(
      new UpdateVocabularyListCommand(
        user.userId,
        listId,
        dto.title,
        dto.description,
        dto.difficultyLevel,
        dto.coverImageMediaId,
        dto.visibility,
        dto.autoAddToSrs,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':listId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a vocabulary list and all its items' })
  @ApiNoContentResponse()
  async remove(
    @Param('listId') listId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteVocabularyListCommand,
      Result<void, VocabularyDomainError>
    >(new DeleteVocabularyListCommand(user.userId, listId));

    if (result.isFail) throwHttpException(result.error);
  }

  @Get(':listId/items')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @ApiOperation({ summary: 'Get paginated items in a vocabulary list (summary, no children)' })
  @ApiOkResponse({ type: PaginatedResponseDto })
  async findItems(
    @Param('listId') listId: string,
    @Query() dto: GetVocabularyListItemsRequestDto,
  ): Promise<PaginatedResponseDto<VocabularyItemSummaryResponseDto>> {
    const result = await this.queryBus.execute<
      GetVocabularyListItemsQuery,
      Result<PaginatedResult<VocabularyItemEntity>, VocabularyDomainError>
    >(new GetVocabularyListItemsQuery(listId, dto.page ?? 1, dto.limit ?? 50));

    if (result.isFail) throwHttpException(result.error);

    return new PaginatedResponseDto({
      items: result.value.items.map((item) => VocabularyItemSummaryResponseDto.from(item)),
      total: result.value.total,
      page: result.value.page,
      limit: result.value.limit,
      totalPages: result.value.totalPages,
    });
  }
}
