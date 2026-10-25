import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { ReviewBlock, ReviewBlockOccurrence } from '../../domain/entities/review-block.entity.js';
import type { ReviewBlockWindow } from '../../application/queries/review-block-window.js';

export const REVIEW_BLOCK_REPEATS = ['one_off', 'weekly'] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar day as the UTC midnight the date columns hold. */
export function parseDay(day: string): Date {
  const date = new Date(`${day}T00:00:00.000Z`);
  // The pattern lets 2026-13-45 through; the calendar does not.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new BadRequestException(`${day} is not a calendar day`);
  }
  return date;
}

const day = (date: Date) => date.toISOString().slice(0, 10);

export class CreateReviewBlockDto {
  @ApiProperty({ enum: REVIEW_BLOCK_REPEATS, description: 'A single sitting, or every week' })
  @IsEnum(REVIEW_BLOCK_REPEATS)
  repeat!: (typeof REVIEW_BLOCK_REPEATS)[number];

  @ApiProperty({
    example: '2026-10-27',
    description: 'First day. A weekly series falls on this weekday.',
  })
  @Matches(DAY, { message: 'startsOn must be YYYY-MM-DD' })
  startsOn!: string;

  @ApiPropertyOptional({
    example: '2026-12-22',
    nullable: true,
    description: 'Last day, inclusive. Leave out for a one-off, or for a series with no end.',
  })
  @IsOptional()
  @Matches(DAY, { message: 'endsOn must be YYYY-MM-DD' })
  endsOn?: string | null;

  @ApiProperty({ example: '16:00' })
  @Matches(HHMM, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @ApiProperty({ example: '17:30', description: 'Same day, after startTime' })
  @Matches(HHMM, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Essays of B1 groups', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** Every field optional; absence leaves it alone, null clears an end or a note. */
export class PatchReviewBlockDto {
  @ApiPropertyOptional({ enum: REVIEW_BLOCK_REPEATS })
  @IsOptional()
  @IsEnum(REVIEW_BLOCK_REPEATS)
  repeat?: (typeof REVIEW_BLOCK_REPEATS)[number];

  @ApiPropertyOptional({ example: '2026-10-27' })
  @IsOptional()
  @Matches(DAY, { message: 'startsOn must be YYYY-MM-DD' })
  startsOn?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null — the series has no end' })
  @IsOptional()
  @Matches(DAY, { message: 'endsOn must be YYYY-MM-DD' })
  endsOn?: string | null;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @Matches(HHMM, { message: 'startTime must be HH:MM' })
  startTime?: string;

  @ApiPropertyOptional({ example: '17:30' })
  @IsOptional()
  @Matches(HHMM, { message: 'endTime must be HH:MM' })
  endTime?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class SkipReviewBlockDayDto {
  @ApiProperty({ example: '2026-11-03', description: 'The sitting to take out of the series' })
  @Matches(DAY, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}

export class ReviewBlockResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() teacherId!: string;
  @ApiProperty({ enum: REVIEW_BLOCK_REPEATS }) repeat!: string;
  @ApiProperty({ example: '2026-10-27' }) startsOn!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Equals startsOn for a one-off' })
  endsOn!: string | null;
  @ApiProperty({ example: '16:00' }) startTime!: string;
  @ApiProperty({ example: '17:30' }) endTime!: string;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ type: [String], description: 'Days taken out of the series — within the window on a list, all of them on a write' }) skips!: string[];
  @ApiProperty() createdBy!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ReviewBlockOccurrenceDto {
  @ApiProperty() blockId!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() teacherId!: string;
  @ApiProperty({ enum: REVIEW_BLOCK_REPEATS }) repeat!: string;
  @ApiProperty({ example: '2026-10-27' }) date!: string;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
}

export class ReviewBlockOverlapDto {
  @ApiProperty({ enum: ['block_lesson', 'blocks'] }) kind!: 'block_lesson' | 'blocks';
  @ApiProperty() teacherId!: string;
  @ApiProperty({ example: '2026-10-27' }) date!: string;
  @ApiPropertyOptional({ description: 'block_lesson: the block' }) blockId?: string;
  @ApiPropertyOptional({ description: 'block_lesson: the lesson it runs into' }) lessonId?: string;
  @ApiPropertyOptional({ description: 'blocks: one of the two' }) blockAId?: string;
  @ApiPropertyOptional({ description: 'blocks: the other' }) blockBId?: string;
}

export class ReviewBlockWindowDto {
  @ApiProperty({ type: [ReviewBlockResponseDto], description: 'Rules with a day in the window' })
  blocks!: ReviewBlockResponseDto[];

  @ApiProperty({ type: [ReviewBlockOccurrenceDto], description: 'Dated sittings in the window' })
  occurrences!: ReviewBlockOccurrenceDto[];

  @ApiProperty({
    type: [ReviewBlockOverlapDto],
    description: 'Sittings running into a lesson (cancelled ones free the slot) or another block',
  })
  overlaps!: ReviewBlockOverlapDto[];
}

export function toReviewBlockDto(block: ReviewBlock): ReviewBlockResponseDto {
  return {
    id: block.id,
    schoolId: block.schoolId,
    teacherId: block.teacherId,
    repeat: block.repeat,
    startsOn: day(block.startsOn),
    endsOn: block.endsOn === null ? null : day(block.endsOn),
    startTime: block.startTime,
    endTime: block.endTime,
    note: block.note,
    skips: [...block.skips].sort(),
    createdBy: block.createdBy,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

function toOccurrenceDto(o: ReviewBlockOccurrence): ReviewBlockOccurrenceDto {
  return { ...o, date: day(o.date) };
}

export function toReviewBlockWindowDto(window: ReviewBlockWindow): ReviewBlockWindowDto {
  return {
    blocks: window.blocks.map(toReviewBlockDto),
    occurrences: window.occurrences.map(toOccurrenceDto),
    overlaps: window.overlaps,
  };
}
