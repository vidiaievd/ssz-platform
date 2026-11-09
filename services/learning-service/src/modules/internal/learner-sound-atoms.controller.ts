import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { GetLearnerSoundAtomsQuery } from '../srs/application/queries/get-learner-sound-atoms.query.js';
import type { LearnerSoundAtomsResult } from '../srs/application/queries/get-learner-sound-atoms.handler.js';

const LANGUAGE = /^[a-z]{2,3}$/;

/**
 * A learner's weak sounds in one language — their `SOUND_ATOM` cards and the sounds flagged in
 * the last fortnight — for the pronunciation drill of exercise-engine (plan 86, step 13.1).
 *
 * Callers send `x-service-token` (not `x-internal-token`) and the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/learners')
export class LearnerSoundAtomsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':userId/sound-atoms')
  async get(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query('language') language?: string,
  ): Promise<LearnerSoundAtomsResult> {
    if (!language || !LANGUAGE.test(language)) throw new BadRequestException('language must be a language code such as nb');
    return this.queryBus.execute(new GetLearnerSoundAtomsQuery(userId, language));
  }
}
