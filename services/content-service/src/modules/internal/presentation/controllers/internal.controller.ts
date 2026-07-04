import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
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

import { GetGlossarySuggestionsQuery } from '../../application/queries/get-glossary-suggestions/get-glossary-suggestions.query.js';
import type { GlossarySuggestion } from '../../application/queries/get-glossary-suggestions/get-glossary-suggestions.handler.js';

import { GetPreflightQuery } from '../../application/queries/get-preflight/get-preflight.query.js';
import type { PreflightResult } from '../../application/queries/get-preflight/get-preflight.handler.js';

import { GetLeafItemsQuery } from '../../../container/application/queries/get-leaf-items/get-leaf-items.query.js';
import type { LeafItem } from '../../../container/application/queries/get-leaf-items/get-leaf-items.handler.js';

// Service-to-service routes only — @Public() exempts them from the global
// JwtAuthGuard (APP_GUARD runs before any controller-level guard), and
// InternalAuthGuard takes over instead, requiring x-internal-token. Excluded
// from the public Swagger doc.
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
  ): Promise<Array<{ type: string; id: string }>> {
    const items = await this.queryBus.execute<GetLeafItemsQuery, LeafItem[]>(
      new GetLeafItemsQuery(containerId),
    );
    return items.map((i) => ({ type: i.itemType, id: i.itemId }));
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
}
