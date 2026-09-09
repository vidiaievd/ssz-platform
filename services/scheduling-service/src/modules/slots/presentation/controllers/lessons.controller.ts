import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LESSON_REPOSITORY, type ILessonRepository } from '../../domain/repositories/lesson.repository.interface.js';
import { Inject } from '@nestjs/common';
import type { Lesson } from '../../domain/entities/lesson.entity.js';

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
  @ApiProperty({ enum: ['scheduled', 'moved', 'cancelled', 'held'] }) status!: string;
  @ApiPropertyOptional() curriculumUnitId!: string | null;
}

class PatchLessonDto {
  @ApiPropertyOptional({ enum: ['scheduled', 'moved', 'cancelled', 'held'] })
  @IsOptional() @IsEnum(['scheduled', 'moved', 'cancelled', 'held'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  room?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  teacherId?: string;

  /**
   * Which curriculum unit this lesson taught. Required to mark a lesson held
   * (unless the lesson already carries one): group progress is counted per
   * unit, so a held lesson naming no unit would be a lesson nobody can count.
   */
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  curriculumUnitId?: string;
}

/** A lesson's own day counts as past — it is marked held after the last bell, not the next day. */
function isInTheFuture(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day.getTime() > today.getTime();
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

@ApiTags('Lessons')
@ApiBearerAuth()
@Controller('scheduling')
export class LessonsController {
  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
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
  @ApiOperation({ summary: 'Override a single lesson, or mark it held' })
  @ApiResponse({ status: 200, type: LessonResponseDto })
  @ApiResponse({ status: 400, description: 'held without a unit, or held before it happened' })
  @ApiResponse({ status: 404, description: 'No such lesson' })
  async patch(
    @Param('lessonId') lessonId: string,
    @Body() body: PatchLessonDto,
  ): Promise<LessonResponseDto> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    if (body.status === 'held') {
      const unitId = body.curriculumUnitId ?? lesson.curriculumUnitId;
      if (!unitId) {
        throw new BadRequestException(
          'A lesson marked held must name the curriculum unit it taught.',
        );
      }
      if (isInTheFuture(lesson.date)) {
        throw new BadRequestException('A lesson cannot be held before it happens.');
      }
    }

    const updated = await this.lessons.update(lessonId, {
      ...(body.status && { status: body.status as any }),
      ...(body.room !== undefined && { room: body.room }),
      ...(body.teacherId && { teacherId: body.teacherId }),
      ...(body.curriculumUnitId !== undefined && { curriculumUnitId: body.curriculumUnitId }),
    });
    return toDto(updated);
  }
}
