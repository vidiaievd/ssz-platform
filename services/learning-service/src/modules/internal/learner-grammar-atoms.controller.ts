import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { GetLearnerGrammarAtomsQuery } from '../srs/application/queries/get-learner-grammar-atoms.query.js';
import type { LearnerGrammarAtomsResult } from '../srs/application/queries/get-learner-grammar-atoms.handler.js';

/**
 * The grammar atoms a learner has reached, for the catalogue a model may point a mistake
 * at — plan 85, step 1. ai-service asks before it reviews a piece of writing; an atom the
 * model names outside this list is dropped (plan 85 §1, rule 4).
 *
 * `courseId` is optional: without it only the queue (`in_queue`) is answered. An unknown
 * course, or one the learner does not hold, answers the queue too rather than a 404 —
 * the queue is true whatever the course.
 *
 * Callers send `x-service-token` (not `x-internal-token`) and the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/learners')
export class LearnerGrammarAtomsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':userId/grammar-atoms')
  async get(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query('courseId') courseId?: string,
  ): Promise<LearnerGrammarAtomsResult> {
    return this.queryBus.execute(new GetLearnerGrammarAtomsQuery(userId, courseId || null));
  }
}
