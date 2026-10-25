import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../common/guards/internal-auth.guard.js';
import { MasteryProfileReader, type MasteryProfile } from './mastery-profile.reader.js';

/**
 * What this learner is weak at — plan 55 §5.2.
 *
 * Internal only: the first consumer is the drill picker (plan 40), which needs a cell to
 * aim generated practice at, and the second is the teacher's view (phase 6), which reaches
 * it through its own service. `@Public()` takes it out of the JWT guard's hands and
 * `InternalAuthGuard` takes over — this answers about a named learner, so it is guarded
 * rather than left to the network like the event replay is. The learner reads their own
 * through `analytics/mastery/me`.
 *
 * The answer has two lists and they are not interchangeable. `weakest` is what may be acted
 * on. `insufficient` is what the profile refuses to judge, and it is the more useful half
 * today: a cell with no evidence usually means the course contains none of that, which is
 * the coverage report's finding arriving from the learner's side (§3.10).
 */
@ApiExcludeController()
@Controller('internal/mastery')
@Public()
@UseGuards(InternalAuthGuard)
export class MasteryController {
  constructor(private readonly reader: MasteryProfileReader) {}

  @Get(':userId')
  async forUser(
    @Param('userId') userId: string,
    /** Narrow to one course. Omitted means every cell the learner has, course or not. */
    @Query('courseId') courseId?: string,
    @Query('limit') limit?: string,
  ): Promise<MasteryProfile> {
    return this.reader.read(userId, courseId, limit);
  }
}
