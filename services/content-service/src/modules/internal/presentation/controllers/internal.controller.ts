import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
}
