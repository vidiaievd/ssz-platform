import { Controller, Get, Inject, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  LESSON_REPOSITORY,
  type ILessonRepository,
} from '../../domain/repositories/lesson.repository.interface.js';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { parseRange } from './my-schedule.rules.js';
import { toSessionDto, SessionResponseDto } from '../dto/session.dto.js';
import type { Lesson } from '../../domain/entities/lesson.entity.js';

/** A session as the student assistant reads it (plan 83, step 2). */
export interface AssistSession {
  id: string;
  groupId: string;
  schoolId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  contentUnitId: string | null;
  contentLessonId: string | null;
}

/**
 * What a learner may know of their class: when, what kind, which unit it teaches. Not the
 * note (a teacher's reason for cancelling), the room or anyone's scores — the answer goes
 * into a model's context, so it carries only what the assistant prepares a learner with.
 */
export function toAssistSession(l: Lesson): AssistSession {
  return {
    id: l.id,
    groupId: l.groupId,
    schoolId: l.schoolId,
    date: l.date.toISOString().slice(0, 10),
    startTime: l.startTime,
    endTime: l.endTime,
    status: l.status,
    type: l.type,
    contentUnitId: l.contentUnitId,
    contentLessonId: l.contentLessonId,
  };
}

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

  // ai-service's student assistant, for a question about a class (plan 83, step 2). It
  // does not know whether the learner is in the group — ai-service checks that against
  // the roster before it asks, as it does for a course's enrollment.
  @Get(':id/assist')
  async forAssistant(@Param('id') id: string): Promise<AssistSession> {
    const session = await this.lessons.findById(id);
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    return toAssistSession(session);
  }
}
