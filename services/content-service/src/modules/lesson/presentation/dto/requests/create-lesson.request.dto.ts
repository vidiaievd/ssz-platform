import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';

export class CreateLessonRequestDto {
  @ApiProperty({ example: 'no', description: 'BCP-47 language tag of the target language' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage: string;

  @ApiProperty({ example: 'A1', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  difficultyLevel: DifficultyLevel;

  @ApiProperty({ example: 'Greetings and Introductions' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Learn how to greet people in Norwegian.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  @IsOptional()
  @IsUUID()
  coverImageMediaId?: string;

  @ApiPropertyOptional({
    example: 'uuid-of-owner-school',
    description:
      'When provided the lesson belongs to a school; otherwise to the authenticated user.',
  })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;

  @ApiProperty({ example: 'public', enum: Visibility })
  @IsEnum(Visibility)
  visibility: Visibility;

  @ApiPropertyOptional({ example: 'text', enum: LessonKind, default: LessonKind.TEXT })
  @IsOptional()
  @IsEnum(LessonKind)
  kind?: LessonKind;

  @ApiPropertyOptional({
    example: '2026-08-01T18:00:00Z',
    description: 'LIVE-kind lessons only — externally-scheduled session start time.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  liveStartsAt?: Date;

  @ApiPropertyOptional({ example: 60, minimum: 1, maximum: 480, description: 'LIVE-kind lessons only.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  liveDurationMinutes?: number;

  @ApiPropertyOptional({
    example: 'https://meet.example.com/session-abc',
    description: 'LIVE-kind lessons only.',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  liveJoinUrl?: string;

  @ApiPropertyOptional({ example: 20, minimum: 1, description: 'LIVE-kind lessons only.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  liveCapacity?: number;
}
