import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../shared/kernel/result.js';
import type { ContentClientError } from '../../../shared/application/ports/content-client.port.js';
import type { RelatableEntityType } from '../../../shared/application/ports/content-client.port.js';
import { GetGrammarRuleMasteryQuery } from '../application/queries/get-grammar-rule-mastery.query.js';
import type { GrammarRuleMasteryDto } from '../application/services/grammar-rule-mastery.service.js';
import { GetContentMasteryQuery } from '../application/queries/get-content-mastery.query.js';
import type { ContentMasteryDto } from '../application/queries/get-content-mastery.handler.js';
import { GetCourseMasteryQuery } from '../application/queries/get-course-mastery.query.js';
import type { CourseMasteryDto } from '../application/queries/get-course-mastery.handler.js';

// Plan 21 §2.1/§2.2 — read-model mastery roll-ups over SrsReviewCard via the
// ContentRelation graph. No new persisted state; computed on every request.
@ApiTags('mastery')
@ApiBearerAuth()
@Controller('mastery')
export class MasteryController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('grammar-rules/:id')
  @ApiOperation({
    summary: "Get the current user's mastery of a grammar rule",
    description:
      "Derived from the retrievability of the rule's exercise-pool cards — there is no " +
      'dedicated GRAMMAR_RULE SRS card type.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async getGrammarRuleMastery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GrammarRuleMasteryDto> {
    const result: Result<GrammarRuleMasteryDto, ContentClientError> = await this.queryBus.execute(
      new GetGrammarRuleMasteryQuery(user.userId, id),
    );
    return this.unwrap(result);
  }

  @Get('content')
  @ApiOperation({
    summary: "Get the current user's mastery roll-up for a content unit (e.g. a lesson)",
    description:
      'Aggregates over the INTRODUCES/FEATURES atoms reachable from this unit via ' +
      'ContentRelation: vocabulary items score off their own SRS card, grammar rules ' +
      'via the derived rule-mastery calculation.',
  })
  @ApiQuery({ name: 'sourceType', required: true })
  @ApiQuery({ name: 'sourceId', required: true, format: 'uuid' })
  async getContentMastery(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sourceType') sourceType?: string,
    @Query('sourceId') sourceId?: string,
  ): Promise<ContentMasteryDto> {
    if (!sourceType || !sourceId) {
      throw new BadRequestException('sourceType and sourceId are required');
    }
    const result: Result<ContentMasteryDto, ContentClientError> = await this.queryBus.execute(
      new GetContentMasteryQuery(user.userId, sourceType as RelatableEntityType, sourceId),
    );
    return this.unwrap(result);
  }

  @Get('course/:containerId')
  @ApiOperation({
    summary: "Get the current user's mastery breakdown by skill for a course",
    description:
      'Returns mastery % for vocab, grammar, reading, listening, spoken, written, and overall. ' +
      'Vocab/grammar from SRS retrievability; reading/listening/spoken/written from can-do ACHIEVED %.',
  })
  @ApiParam({ name: 'containerId', format: 'uuid' })
  async getCourseMastery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('containerId') containerId: string,
  ): Promise<CourseMasteryDto> {
    return this.queryBus.execute(new GetCourseMasteryQuery(user.userId, containerId));
  }

  private unwrap<T>(result: Result<T, ContentClientError>): T {
    if (result.isOk) return result.value;
    throw new BadRequestException(result.error.message);
  }
}
