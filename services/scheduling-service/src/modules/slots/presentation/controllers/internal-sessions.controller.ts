import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  LESSON_REPOSITORY,
  type ILessonRepository,
} from '../../domain/repositories/lesson.repository.interface.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { parseRange } from './my-schedule.rules.js';
import { toSessionDto, SessionResponseDto } from '../dto/session.dto.js';

/**
 * The sessions of a day, for a job that has no user behind it.
 *
 * notification-service asks this to remind learners of a lesson tomorrow, and it asks
 * about the day rather than about a school: the reminder is the same question for every
 * workspace on the platform, and asking school by school would mean knowing the list of
 * schools in a service that has no business holding one.
 *
 * `@Public()` takes it out of the JWT guard's hands — the caller carries no user token —
 * and the internal guard beside it is what actually admits it.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/sessions')
export class InternalSessionsController {
  constructor(@Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository) {}

  @Get('upcoming')
  async upcoming(
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<SessionResponseDto[]> {
    const range = parseRange(from, to);
    const sessions = await this.lessons.findInDateRange(range.from, range.to);
    return sessions.map(toSessionDto);
  }
}
