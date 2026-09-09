import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import type { Result } from '../../../../shared/kernel/result.js';

import { ListRelationsBySourceQuery } from '../../../content-relation/application/queries/list-relations-by-source/list-relations-by-source.query.js';
import { ListRelationsByTargetQuery } from '../../../content-relation/application/queries/list-relations-by-target/list-relations-by-target.query.js';
import { ListContentRelationsRequestDto } from '../../../content-relation/presentation/dto/requests/list-content-relations.request.dto.js';
import { ContentRelationResponseDto } from '../../../content-relation/presentation/dto/responses/content-relation.response.dto.js';
import type { ContentRelationEntity } from '../../../content-relation/domain/entities/content-relation.entity.js';

import { GetPoolExerciseIdsQuery } from '../../../grammar-rule/application/queries/get-pool-exercise-ids/get-pool-exercise-ids.query.js';

import { GetExerciseEnvelopeQuery } from '../../../exercise/application/queries/get-exercise-envelope/get-exercise-envelope.query.js';
import type { ExerciseEnvelope } from '../../../exercise/application/queries/get-exercise-envelope/get-exercise-envelope.handler.js';
import type { ExerciseDomainError } from '../../../exercise/domain/exceptions/exercise-domain.exceptions.js';
import { throwHttpException } from '../../../exercise/presentation/utils/domain-error.mapper.js';

import { GetCanDoDescriptorsByModuleQuery } from '../../../can-do/application/queries/get-descriptors-by-module/get-descriptors-by-module.query.js';
import { GetCanDoDescriptorsByIdsQuery } from '../../../can-do/application/queries/get-descriptors-by-ids/get-descriptors-by-ids.query.js';
import type { CanDoDescriptorEntity } from '../../../can-do/domain/entities/can-do-descriptor.entity.js';
import { CanDoDescriptorResponse } from '../../../can-do/presentation/dto/can-do-descriptor.dto.js';

import { GetExpandedModuleQuery } from '../../application/queries/get-expanded-module/get-expanded-module.query.js';
import type { ExpandedModulePayload } from '../../application/queries/get-expanded-module/get-expanded-module.handler.js';

import { GetVocabularyItemForDisplayQuery } from '../../../vocabulary/application/queries/get-vocabulary-item-for-display/get-vocabulary-item-for-display.query.js';
import type { VocabularyItemDisplayResult } from '../../../vocabulary/application/dto/vocabulary-item-display-result.js';
import { BatchGetVocabularyItemsForDisplayQuery } from '../../../vocabulary/application/queries/batch-get-vocabulary-items-for-display/batch-get-vocabulary-items-for-display.query.js';
import { BatchGetVocabularyItemsForDisplayRequestDto } from '../../../vocabulary/presentation/dto/requests/batch-get-vocabulary-items-for-display.request.dto.js';
import { GetVocabularyListQuery } from '../../../vocabulary/application/queries/get-vocabulary-list/get-vocabulary-list.query.js';
import { GetVocabularyListItemsQuery } from '../../../vocabulary/application/queries/get-vocabulary-list-items/get-vocabulary-list-items.query.js';
import { VocabularyListResponseDto } from '../../../vocabulary/presentation/dto/responses/vocabulary-list.response.dto.js';
import type { VocabularyListEntity } from '../../../vocabulary/domain/entities/vocabulary-list.entity.js';
import type { VocabularyItemEntity } from '../../../vocabulary/domain/entities/vocabulary-item.entity.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';

import { GetGlossarySuggestionsQuery } from '../../application/queries/get-glossary-suggestions/get-glossary-suggestions.query.js';
import type { GlossarySuggestion } from '../../application/queries/get-glossary-suggestions/get-glossary-suggestions.handler.js';

import { GetPreflightQuery } from '../../application/queries/get-preflight/get-preflight.query.js';
import { GetPublishStatesQuery } from '../../../container/application/queries/get-publish-states/get-publish-states.query.js';
import type { ContainerPublishSummary } from '../../../container/application/queries/get-publish-states/get-publish-states.handler.js';
import type { PreflightResult } from '../../application/queries/get-preflight/get-preflight.handler.js';

import { GetLeafItemsQuery } from '../../../container/application/queries/get-leaf-items/get-leaf-items.query.js';
import type { LeafItem } from '../../../container/application/queries/get-leaf-items/get-leaf-items.handler.js';
import { GetContainerQuery } from '../../../container/application/queries/get-container/get-container.query.js';
import type { GetContainerResult } from '../../../container/application/queries/get-container/get-container.handler.js';
import type { ContainerDomainError } from '../../../container/domain/exceptions/container-domain.exceptions.js';

import { GetModuleReaderStructureQuery } from '../../application/queries/get-module-reader-structure/get-module-reader-structure.query.js';
import type { ModuleReaderStructureResult } from '../../application/queries/get-module-reader-structure/get-module-reader-structure.handler.js';

import { GetExercisePlacementQuery } from '../../application/queries/get-exercise-placement/get-exercise-placement.query.js';
import type { ExercisePlacementResult } from '../../application/queries/get-exercise-placement/get-exercise-placement.handler.js';

// Service-to-service routes only — @Public() exempts them from the global
// JwtAuthGuard (APP_GUARD runs before any controller-level guard), and
// InternalAuthGuard takes over instead, requiring x-internal-token. Excluded
// from the public Swagger doc.
/** Page size used when walking a vocabulary list's items internally. */
const INTERNAL_ITEMS_PAGE_SIZE = 200;

@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal')
export class InternalController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('content-relations')
  async listContentRelations(
    @Query() dto: ListContentRelationsRequestDto,
  ): Promise<ContentRelationResponseDto[]> {
    const hasSource = !!dto.sourceType && !!dto.sourceId;
    const hasTarget = !!dto.targetType && !!dto.targetId;

    if (hasSource === hasTarget) {
      throw new BadRequestException(
        'Provide either (sourceType, sourceId) or (targetType, targetId), not both or neither',
      );
    }

    const relations = hasSource
      ? await this.queryBus.execute<ListRelationsBySourceQuery, ContentRelationEntity[]>(
          new ListRelationsBySourceQuery(dto.sourceType!, dto.sourceId!, dto.relationKind),
        )
      : await this.queryBus.execute<ListRelationsByTargetQuery, ContentRelationEntity[]>(
          new ListRelationsByTargetQuery(dto.targetType!, dto.targetId!, dto.relationKind),
        );

    return relations.map((r) => ContentRelationResponseDto.fromEntity(r));
  }

  @Get('exercises/:id')
  async getExerciseEnvelope(
    @Param('id') id: string,
    @Query('language') language?: string,
    @Query('mode') mode?: string,
  ): Promise<ExerciseEnvelope> {
    const result = await this.queryBus.execute<
      GetExerciseEnvelopeQuery,
      Result<ExerciseEnvelope, ExerciseDomainError>
    >(new GetExerciseEnvelopeQuery(id, language, mode));

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Get('grammar-rules/:id/pool-exercise-ids')
  async getPoolExerciseIds(@Param('id') ruleId: string): Promise<{ exerciseIds: string[] }> {
    const exerciseIds = await this.queryBus.execute<GetPoolExerciseIdsQuery, string[]>(
      new GetPoolExerciseIdsQuery(ruleId),
    );
    return { exerciseIds };
  }

  @Get('lessons/:id/glossary-suggestions')
  async getGlossarySuggestions(
    @Param('id') lessonId: string,
    @Query('language') language = 'nb',
  ): Promise<GlossarySuggestion[]> {
    return this.queryBus.execute(new GetGlossarySuggestionsQuery(lessonId, language));
  }

  @Get('vocabulary-items/:id')
  async getVocabularyItem(
    @Param('id') id: string,
    @Query('language') language = 'en',
    @Query('includeExamples') includeExamples = 'true',
    @Query('examplesLimit') examplesLimit = '3',
    @Query('knownLanguages') knownLanguages?: string,
  ): Promise<VocabularyItemDisplayResult> {
    const langs = knownLanguages ? knownLanguages.split(',') : [language];
    const result = await this.queryBus.execute<
      GetVocabularyItemForDisplayQuery,
      Result<VocabularyItemDisplayResult, string>
    >(
      new GetVocabularyItemForDisplayQuery(
        id,
        language,
        includeExamples !== 'false',
        Number(examplesLimit),
        false,
        langs,
      ),
    );
    if (result.isFail) throw new NotFoundException(`Vocabulary item ${id} not found`);
    return result.value;
  }

  // Batch variant of the route above. Learning Service uses it to enrich a due
  // SRS queue with word text in one round trip; the public equivalent is nested
  // under a list id, which an SRS card (item id only) cannot supply.
  @Post('vocabulary-items/batch-display')
  @HttpCode(200)
  async batchGetVocabularyItems(
    @Body() dto: BatchGetVocabularyItemsForDisplayRequestDto,
  ): Promise<VocabularyItemDisplayResult[]> {
    const result = await this.queryBus.execute<
      BatchGetVocabularyItemsForDisplayQuery,
      Result<VocabularyItemDisplayResult[], unknown>
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

    if (result.isFail) throw new BadRequestException('Failed to load vocabulary items');
    return result.value;
  }

  // Learning Service reads list metadata for the auto-add-to-SRS flag
  // (vocabulary-enrollment consumer) — the public route is JWT + visibility
  // guarded, which service-to-service traffic cannot satisfy.
  @Get('vocabulary-lists/:id')
  async getVocabularyList(@Param('id') id: string): Promise<VocabularyListResponseDto> {
    const result = await this.queryBus.execute<
      GetVocabularyListQuery,
      Result<VocabularyListEntity, unknown>
    >(new GetVocabularyListQuery(id));

    if (result.isFail) throw new NotFoundException(`Vocabulary list ${id} not found`);
    return VocabularyListResponseDto.from(result.value);
  }

  // Every item id in the list, unpaginated: SRS seeding
  // (BulkIntroduceFromVocabularyList) needs the whole list, not a page.
  @Get('vocabulary-lists/:id/items')
  async getVocabularyListItems(
    @Param('id') id: string,
  ): Promise<Array<{ id: string; word: string; position: number }>> {
    const items: Array<{ id: string; word: string; position: number }> = [];

    for (let page = 1; ; page++) {
      const result = await this.queryBus.execute<
        GetVocabularyListItemsQuery,
        Result<PaginatedResult<VocabularyItemEntity>, unknown>
      >(new GetVocabularyListItemsQuery(id, page, INTERNAL_ITEMS_PAGE_SIZE));

      if (result.isFail) throw new NotFoundException(`Vocabulary list ${id} not found`);

      for (const item of result.value.items) {
        items.push({ id: item.id, word: item.word, position: item.position });
      }

      if (page >= result.value.totalPages || result.value.items.length === 0) break;
    }

    return items;
  }

  @Get('can-do/descriptors')
  async getCanDoDescriptorsByIds(
    @Query('ids') ids?: string,
  ): Promise<CanDoDescriptorResponse[]> {
    if (!ids) return [];
    const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
    const descriptors = await this.queryBus.execute<
      GetCanDoDescriptorsByIdsQuery,
      CanDoDescriptorEntity[]
    >(new GetCanDoDescriptorsByIdsQuery(idList));
    return descriptors.map(CanDoDescriptorResponse.fromEntity);
  }

  @Get('modules/:id/can-do')
  async getModuleCanDo(
    @Param('id') moduleId: string,
  ): Promise<CanDoDescriptorResponse[]> {
    const descriptors = await this.queryBus.execute<
      GetCanDoDescriptorsByModuleQuery,
      CanDoDescriptorEntity[]
    >(new GetCanDoDescriptorsByModuleQuery(moduleId));
    return descriptors.map(CanDoDescriptorResponse.fromEntity);
  }

  @Get('containers/:id/leaf-items')
  async getContainerLeafItems(
    @Param('id') containerId: string,
  ): Promise<Array<{ type: string; id: string; moduleId: string | null; isRequired: boolean }>> {
    const items = await this.queryBus.execute<GetLeafItemsQuery, LeafItem[]>(
      new GetLeafItemsQuery(containerId),
    );
    return items.map((i) => ({
      type: i.itemType,
      id: i.itemId,
      moduleId: i.moduleId,
      isRequired: i.isRequired,
    }));
  }

  // Learning Service's EnrollInContainerHandler reads this before creating an
  // enrollment (content-client.ts's getAccessTier); it compares the result
  // against uppercase literals ('ASSIGNED_ONLY', 'FREE_WITHIN_SCHOOL', ...),
  // so the domain's lowercase AccessTier enum value is upper-cased on the wire
  // here rather than passed through raw.
  @Get('containers/:id/access-tier')
  async getContainerAccessTier(@Param('id') id: string): Promise<{ accessTier: string }> {
    const result = await this.queryBus.execute<
      GetContainerQuery,
      Result<GetContainerResult, ContainerDomainError>
    >(new GetContainerQuery(id, ''));

    if (result.isFail) throw new NotFoundException(`Container ${id} not found`);
    return { accessTier: result.value.container.accessTier.toUpperCase() };
  }

  // The author's course list needs to tell "published" from "published, with
  // changes students cannot see yet" — for a page of courses at once, and
  // including modules, which are versioned independently of their course.
  @Get('containers/publish-states')
  async getPublishStates(@Query('ids') ids = ''): Promise<ContainerPublishSummary[]> {
    const containerIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    return this.queryBus.execute<GetPublishStatesQuery, ContainerPublishSummary[]>(
      new GetPublishStatesQuery(containerIds),
    );
  }

  @Get('versions/:id/preflight')
  async getPreflight(@Param('id') versionId: string): Promise<PreflightResult> {
    return this.queryBus.execute<GetPreflightQuery, PreflightResult>(
      new GetPreflightQuery(versionId),
    );
  }

  @Get('modules/:id/expanded')
  async getExpandedModule(
    @Param('id') moduleId: string,
    @Query('language') language = 'en',
    @Query('level') level = 'A1',
  ): Promise<ExpandedModulePayload> {
    return this.queryBus.execute<GetExpandedModuleQuery, ExpandedModulePayload>(
      new GetExpandedModuleQuery(moduleId, language, level),
    );
  }

  @Get('modules/:id/reader-structure')
  async getModuleReaderStructure(
    @Param('id') moduleId: string,
  ): Promise<ModuleReaderStructureResult> {
    return this.queryBus.execute<GetModuleReaderStructureQuery, ModuleReaderStructureResult>(
      new GetModuleReaderStructureQuery(moduleId),
    );
  }

  // Exercise Engine calls this once per attempt start to snapshot which
  // course/module a submission belongs to (plan 44 §44.1).
  @Get('exercises/:id/placement')
  async getExercisePlacement(@Param('id') id: string): Promise<ExercisePlacementResult> {
    return this.queryBus.execute<GetExercisePlacementQuery, ExercisePlacementResult>(
      new GetExercisePlacementQuery(id),
    );
  }
}
