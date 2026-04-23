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
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { VisibilityGuard } from '../../../../shared/access-control/presentation/guards/visibility.guard.js';
import { RequireAccess } from '../../../../shared/access-control/presentation/decorators/require-access.decorator.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';

// Commands — items
import { CreateVocabularyItemCommand } from '../../application/commands/create-vocabulary-item/create-vocabulary-item.command.js';
import type { CreateVocabularyItemResult } from '../../application/commands/create-vocabulary-item/create-vocabulary-item.handler.js';
import { BulkCreateVocabularyItemsCommand } from '../../application/commands/bulk-create-vocabulary-items/bulk-create-vocabulary-items.command.js';
import type { BulkCreateVocabularyItemsResult } from '../../application/commands/bulk-create-vocabulary-items/bulk-create-vocabulary-items.handler.js';
import { UpdateVocabularyItemCommand } from '../../application/commands/update-vocabulary-item/update-vocabulary-item.command.js';
import { DeleteVocabularyItemCommand } from '../../application/commands/delete-vocabulary-item/delete-vocabulary-item.command.js';
import { ReorderVocabularyItemsCommand } from '../../application/commands/reorder-vocabulary-items/reorder-vocabulary-items.command.js';

// Commands — item translations
import { UpsertItemTranslationCommand } from '../../application/commands/upsert-item-translation/upsert-item-translation.command.js';
import type { UpsertItemTranslationResult } from '../../application/commands/upsert-item-translation/upsert-item-translation.handler.js';
import { DeleteItemTranslationCommand } from '../../application/commands/delete-item-translation/delete-item-translation.command.js';

// Queries
import { GetVocabularyItemQuery } from '../../application/queries/get-vocabulary-item/get-vocabulary-item.query.js';
import { GetVocabularyItemForDisplayQuery } from '../../application/queries/get-vocabulary-item-for-display/get-vocabulary-item-for-display.query.js';
import { BatchGetVocabularyItemsForDisplayQuery } from '../../application/queries/batch-get-vocabulary-items-for-display/batch-get-vocabulary-items-for-display.query.js';

// Domain types
import type { VocabularyDomainError } from '../../domain/exceptions/vocabulary-domain.exceptions.js';
import type { VocabularyItemEntity } from '../../domain/entities/vocabulary-item.entity.js';
import type { VocabularyItemDisplayResult } from '../../application/dto/vocabulary-item-display-result.js';

// Request DTOs
import { CreateVocabularyItemRequestDto } from '../dto/requests/create-vocabulary-item.request.dto.js';
import { BulkCreateVocabularyItemsRequestDto } from '../dto/requests/bulk-create-vocabulary-items.request.dto.js';
import { UpdateVocabularyItemRequestDto } from '../dto/requests/update-vocabulary-item.request.dto.js';
import { ReorderVocabularyItemsRequestDto } from '../dto/requests/reorder-vocabulary-items.request.dto.js';
import { UpsertItemTranslationRequestDto } from '../dto/requests/upsert-item-translation.request.dto.js';
import { GetVocabularyItemForDisplayRequestDto } from '../dto/requests/get-vocabulary-item-for-display.request.dto.js';
import { BatchGetVocabularyItemsForDisplayRequestDto } from '../dto/requests/batch-get-vocabulary-items-for-display.request.dto.js';

// Response DTOs
import { VocabularyItemResponseDto } from '../dto/responses/vocabulary-item.response.dto.js';
import { VocabularyItemDisplayResponseDto } from '../dto/responses/vocabulary-item-display.response.dto.js';

// Error mapper
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Vocabulary Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vocabulary-lists/:listId/items')
export class VocabularyItemController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  // ── Item CRUD ──────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @ApiOperation({ summary: 'Add a vocabulary item to a list' })
  @ApiCreatedResponse({ description: 'Returns the new item ID' })
  async create(
    @Param('listId') listId: string,
    @Body() dto: CreateVocabularyItemRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ itemId: string }> {
    const result = await this.commandBus.execute<
      CreateVocabularyItemCommand,
      Result<CreateVocabularyItemResult, VocabularyDomainError>
    >(
      new CreateVocabularyItemCommand(
        user.userId,
        listId,
        dto.word,
        dto.partOfSpeech,
        dto.ipaTranscription,
        dto.pronunciationAudioMediaId,
        dto.grammaticalProperties,
        dto.register,
        dto.notes,
        dto.position,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Post('bulk')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @ApiOperation({ summary: 'Bulk-add vocabulary items to a list (max 500)' })
  @ApiCreatedResponse({ description: 'Returns the IDs of the created items' })
  async bulkCreate(
    @Param('listId') listId: string,
    @Body() dto: BulkCreateVocabularyItemsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ itemIds: string[] }> {
    const result = await this.commandBus.execute<
      BulkCreateVocabularyItemsCommand,
      Result<BulkCreateVocabularyItemsResult, VocabularyDomainError>
    >(new BulkCreateVocabularyItemsCommand(user.userId, listId, dto.items));

    if (result.isFail) throwHttpException(result.error);
    return { itemIds: result.value.createdItemIds };
  }

  @Patch('reorder')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorder all items in a vocabulary list' })
  @ApiNoContentResponse()
  async reorder(
    @Param('listId') listId: string,
    @Body() dto: ReorderVocabularyItemsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      ReorderVocabularyItemsCommand,
      Result<void, VocabularyDomainError>
    >(new ReorderVocabularyItemsCommand(user.userId, listId, dto.items));

    if (result.isFail) throwHttpException(result.error);
  }

  @Get(':itemId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @ApiOperation({
    summary: 'Get a full vocabulary item (authoring — all translations and examples)',
  })
  @ApiOkResponse({ type: VocabularyItemResponseDto })
  async findOne(@Param('itemId') itemId: string): Promise<VocabularyItemResponseDto> {
    const result = await this.queryBus.execute<
      GetVocabularyItemQuery,
      Result<VocabularyItemEntity, VocabularyDomainError>
    >(new GetVocabularyItemQuery(itemId));

    if (result.isFail) throwHttpException(result.error);
    return VocabularyItemResponseDto.from(result.value);
  }

  @Get(':itemId/display')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @ApiOperation({
    summary:
      'Get a vocabulary item formatted for student display (cached, with translation fallback)',
  })
  @ApiOkResponse({ type: VocabularyItemDisplayResponseDto })
  async getForDisplay(
    @Param('itemId') itemId: string,
    @Query() dto: GetVocabularyItemForDisplayRequestDto,
  ): Promise<VocabularyItemDisplayResponseDto> {
    const result = await this.queryBus.execute<
      GetVocabularyItemForDisplayQuery,
      Result<VocabularyItemDisplayResult, VocabularyDomainError>
    >(
      new GetVocabularyItemForDisplayQuery(
        itemId,
        dto.translationLanguage,
        dto.includeExamples ?? false,
        dto.examplesLimit ?? 3,
        dto.examplesRandom ?? false,
        dto.studentKnownLanguages ?? [],
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return VocabularyItemDisplayResponseDto.from(result.value);
  }

  @Post('batch-display')
  @UseGuards(VisibilityGuard)
  @RequireAccess('view', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @ApiOperation({
    summary: 'Batch-fetch vocabulary items for student display (max 200 IDs, cache-aware)',
  })
  @ApiOkResponse({ type: VocabularyItemDisplayResponseDto, isArray: true })
  async batchGetForDisplay(
    @Body() dto: BatchGetVocabularyItemsForDisplayRequestDto,
  ): Promise<VocabularyItemDisplayResponseDto[]> {
    const result = await this.queryBus.execute<
      BatchGetVocabularyItemsForDisplayQuery,
      Result<VocabularyItemDisplayResult[], VocabularyDomainError>
    >(
      new BatchGetVocabularyItemsForDisplayQuery(
        dto.vocabularyItemIds,
        dto.translationLanguage,
        dto.includeExamples ?? false,
        dto.examplesLimit ?? 3,
        dto.examplesRandom ?? false,
        dto.studentKnownLanguages ?? [],
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value.map((r) => VocabularyItemDisplayResponseDto.from(r));
  }

  @Patch(':itemId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update vocabulary item metadata' })
  @ApiNoContentResponse()
  async update(
    @Param('listId') listId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateVocabularyItemRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateVocabularyItemCommand,
      Result<void, VocabularyDomainError>
    >(
      new UpdateVocabularyItemCommand(
        user.userId,
        listId,
        itemId,
        dto.word,
        dto.partOfSpeech,
        dto.ipaTranscription,
        dto.pronunciationAudioMediaId,
        dto.grammaticalProperties,
        dto.register,
        dto.notes,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':itemId')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a vocabulary item' })
  @ApiNoContentResponse()
  async remove(
    @Param('listId') listId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteVocabularyItemCommand,
      Result<void, VocabularyDomainError>
    >(new DeleteVocabularyItemCommand(user.userId, listId, itemId));

    if (result.isFail) throwHttpException(result.error);
  }

  // ── Item translation sub-resources ────────────────────────────────────────

  @Put(':itemId/translations/:lang')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @ApiOperation({
    summary: 'Create or update the translation for a vocabulary item in a given language',
  })
  @ApiOkResponse({ description: 'Returns the translation ID and whether it was newly created' })
  async upsertTranslation(
    @Param('itemId') itemId: string,
    @Param('lang') lang: string,
    @Body() dto: UpsertItemTranslationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ translationId: string; wasCreated: boolean }> {
    const result = await this.commandBus.execute<
      UpsertItemTranslationCommand,
      Result<UpsertItemTranslationResult, VocabularyDomainError>
    >(
      new UpsertItemTranslationCommand(
        user.userId,
        itemId,
        lang,
        dto.primaryTranslation,
        dto.alternativeTranslations,
        dto.definition,
        dto.usageNotes,
        dto.falseFriendWarning,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Delete(':itemId/translations/:lang')
  @UseGuards(VisibilityGuard)
  @RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the translation of a vocabulary item for a given language' })
  @ApiNoContentResponse()
  async deleteTranslation(
    @Param('listId') listId: string,
    @Param('itemId') itemId: string,
    @Param('lang') lang: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteItemTranslationCommand,
      Result<void, VocabularyDomainError>
    >(new DeleteItemTranslationCommand(user.userId, itemId, lang));

    if (result.isFail) throwHttpException(result.error);
  }
}
