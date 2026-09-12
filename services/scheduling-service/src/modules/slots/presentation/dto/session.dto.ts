import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Lesson } from '../../domain/entities/lesson.entity.js';

export const SESSION_TYPES = ['lesson', 'exam', 'make_up', 'review'] as const;
export const SESSION_STATUSES = ['scheduled', 'moved', 'cancelled', 'held'] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SessionScoreDto {
  @ApiProperty() @IsString() studentId!: string;

  @ApiPropertyOptional({
    description: '0..100, or null for a student who has not been graded yet',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score!: number | null;
}

export class SessionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() groupId!: string;
  @ApiProperty() schoolId!: string;
  @ApiPropertyOptional({ nullable: true }) slotId!: string | null;
  @ApiProperty({ description: 'ISO date, the day it is actually taught' }) date!: string;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiPropertyOptional({ nullable: true }) teacherId!: string | null;
  @ApiPropertyOptional({ nullable: true }) room!: string | null;
  @ApiProperty({ enum: SESSION_STATUSES }) status!: string;
  @ApiProperty({ enum: SESSION_TYPES }) type!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Unit of the group teaching plan' })
  curriculumUnitId!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Unit of the course being taught' })
  contentUnitId!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Course item this session covers' })
  contentLessonId!: string | null;
  @ApiPropertyOptional({ nullable: true }) attendance!: number | null;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ description: 'Outside the weekly pattern' }) extra!: boolean;
  @ApiPropertyOptional({ nullable: true }) planIndex!: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Pass mark for this exam alone' })
  passMark!: number | null;
  @ApiProperty({ type: [SessionScoreDto] }) scores!: SessionScoreDto[];
}

/**
 * Everything a person may change about a session. Every field is optional, and
 * absence means "leave it alone" — while an explicit null clears what can be
 * cleared (teacher, topic, attendance, reason).
 */
export class PatchSessionDto {
  @ApiPropertyOptional({ enum: SESSION_TYPES })
  @IsOptional()
  @IsEnum(SESSION_TYPES)
  type?: (typeof SESSION_TYPES)[number];

  @ApiPropertyOptional({ enum: SESSION_STATUSES })
  @IsOptional()
  @IsEnum(SESSION_STATUSES)
  status?: (typeof SESSION_STATUSES)[number];

  @ApiPropertyOptional({ description: 'ISO date — changing it is a reschedule' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(HHMM, { message: 'startTime must be HH:MM' })
  startTime?: string;

  @ApiPropertyOptional({ example: '10:30' })
  @IsOptional()
  @Matches(HHMM, { message: 'endTime must be HH:MM' })
  endTime?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  room?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'null unassigns the session' })
  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Course unit; null clears the topic' })
  @IsOptional()
  @IsString()
  contentUnitId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  contentLessonId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Plan unit. Derived from contentUnitId when not given.',
  })
  @IsOptional()
  @IsString()
  curriculumUnitId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'How many turned up; never for an exam' })
  @IsOptional()
  @IsInt()
  @Min(0)
  attendance?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Why it was cancelled' })
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Overrides the school pass mark' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passMark?: number | null;
}

/** A session added outside the weekly pattern — a make-up class, an extra exam. */
export class CreateSessionDto {
  @ApiProperty({ description: 'ISO date' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '09:00' })
  @Matches(HHMM, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @ApiProperty({ example: '10:30' })
  @Matches(HHMM, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @ApiPropertyOptional({ enum: SESSION_TYPES, default: 'lesson' })
  @IsOptional()
  @IsEnum(SESSION_TYPES)
  type?: (typeof SESSION_TYPES)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  room?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  contentUnitId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  contentLessonId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class PutScoresDto {
  @ApiProperty({
    type: [SessionScoreDto],
    description:
      'The graded roster. A student left out loses their mark; a null score means not graded.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionScoreDto)
  scores!: SessionScoreDto[];
}

export class GradingPolicyDto {
  @ApiProperty({ description: 'Score at or above which a student passes', example: 60 })
  @IsInt()
  @Min(0)
  @Max(100)
  passMark!: number;
}

export class RegenerateResultDto {
  @ApiProperty({ description: 'Sessions planned by this pass' }) planned!: number;
  @ApiProperty({ description: 'Sessions left untouched because they are already history' })
  kept!: number;
  @ApiPropertyOptional({ nullable: true, description: 'Why nothing was planned, when nothing was' })
  reason!: string | null;
}

export function toSessionDto(l: Lesson): SessionResponseDto {
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
    type: l.type,
    curriculumUnitId: l.curriculumUnitId,
    contentUnitId: l.contentUnitId,
    contentLessonId: l.contentLessonId,
    attendance: l.attendance,
    note: l.note,
    extra: l.extra,
    planIndex: l.planIndex,
    passMark: l.passMark,
    scores: l.scores.map((s) => ({ studentId: s.studentId, score: s.score })),
  };
}
