import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
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
  @ApiProperty() teacherId!: string;
  @ApiPropertyOptional() room!: string | null;
  @ApiProperty({ enum: ['scheduled', 'moved', 'cancelled'] }) status!: string;
  @ApiPropertyOptional() curriculumUnitId!: string | null;
}

class PatchLessonDto {
  @ApiPropertyOptional({ enum: ['scheduled', 'moved', 'cancelled'] })
  @IsOptional() @IsEnum(['scheduled', 'moved', 'cancelled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  room?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  teacherId?: string;
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
  @ApiOperation({ summary: 'Override a single lesson' })
  @ApiResponse({ status: 200, type: LessonResponseDto })
  async patch(
    @Param('lessonId') lessonId: string,
    @Body() body: PatchLessonDto,
  ): Promise<LessonResponseDto> {
    const updated = await this.lessons.update(lessonId, {
      ...(body.status && { status: body.status as any }),
      ...(body.room !== undefined && { room: body.room }),
      ...(body.teacherId && { teacherId: body.teacherId }),
    });
    return toDto(updated);
  }
}
