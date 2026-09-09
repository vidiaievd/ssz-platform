import { Body, Controller, Get, Inject, Param, Patch, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { LESSON_REPOSITORY, type ILessonRepository } from '../../domain/repositories/lesson.repository.interface.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Lesson } from '../../domain/entities/lesson.entity.js';
import { SessionWriterService } from '../../application/services/session-writer.service.js';
import { PatchSessionDto, SESSION_STATUSES } from '../dto/session.dto.js';

class LessonResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() groupId!: string;
  @ApiProperty() schoolId!: string;
  @ApiPropertyOptional() slotId!: string | null;
  @ApiProperty() date!: string;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiPropertyOptional() teacherId!: string | null;
  @ApiPropertyOptional() room!: string | null;
  @ApiProperty({ enum: SESSION_STATUSES }) status!: string;
  @ApiPropertyOptional() curriculumUnitId!: string | null;
}

function toDto(l: Lesson): LessonResponseDto {
  return {
    id: l.id,
    groupId: l.groupId,
    schoolId: l.schoolId,
    slotId: l.slotId,
    date: l.date.toISOString().slice(0, 10),
    startTime: l.startTime,
    endTime: l.endTime,
    teacherId: l.teacherId,
    room: l.room,
    status: l.status,
    curriculumUnitId: l.curriculumUnitId,
  };
}

/**
 * The lesson-shaped view of sessions, kept for the callers built against it:
 * the teacher timetable, the substitution screens and the group page's
 * "next lessons" strip. New work reads Sessions instead, which carries the
 * topic, the type and the facts.
 */
@ApiTags('Lessons')
@ApiBearerAuth()
@Controller('scheduling')
export class LessonsController {
  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
    private readonly writer: SessionWriterService,
  ) {}

  @Get('groups/:groupId/lessons')
  @ApiOperation({ summary: 'List lessons for a group within a date range' })
  @ApiResponse({ status: 200, type: [LessonResponseDto] })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async list(
    @Param('groupId') groupId: string,
    @Query('from') fromStr: string,
    @Query('to') toStr: string,
  ): Promise<LessonResponseDto[]> {
    const lessons = await this.lessons.findByGroup(groupId, new Date(fromStr), new Date(toStr));
    return lessons.map(toDto);
  }

  @Get('groups/:groupId/lessons/next')
  @ApiOperation({ summary: 'Get next upcoming lessons for a group' })
  @ApiResponse({ status: 200, type: [LessonResponseDto] })
  @ApiQuery({ name: 'limit', required: false })
  async next(
    @Param('groupId') groupId: string,
    @Query('limit') limitStr?: string,
  ): Promise<LessonResponseDto[]> {
    const limit = limitStr ? parseInt(limitStr, 10) : 5;
    const lessons = await this.lessons.findNextForGroup(groupId, limit);
    return lessons.map(toDto);
  }

  @Patch('lessons/:lessonId')
  @ApiOperation({
    summary: 'Change one lesson, or mark it held',
    description:
      'Delegates to PATCH /sessions/:id — one set of rules, whichever door a caller comes through.',
  })
  @ApiResponse({ status: 200, type: LessonResponseDto })
  @ApiResponse({ status: 400, description: 'Held before it happened, or incoherent times' })
  @ApiResponse({ status: 404, description: 'No such lesson' })
  async patch(
    @Param('lessonId') lessonId: string,
    @Body() body: PatchSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LessonResponseDto> {
    // Mapped down rather than spread: this view predates types, topics and
    // results, and callers built against it should not start seeing them.
    return toDto(await this.writer.patch(lessonId, body, user));
  }
}
