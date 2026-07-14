import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
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

export class UpdateLessonRequestDto {
  @ApiPropertyOptional({ example: 'Greetings and Introductions (Revised)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated description.',
    nullable: true,
    description: 'Pass null to clear the description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: 'A2', enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @ApiPropertyOptional({
    example: 'uuid-of-new-cover-image',
    nullable: true,
    description: 'Pass null to remove the cover image.',
  })
  @IsOptional()
  @IsUUID()
  coverImageMediaId?: string | null;

  @ApiPropertyOptional({ example: 'shared', enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({
    example: '2026-08-01T18:00:00Z',
    nullable: true,
    description: 'LIVE-kind lessons only. Pass null to clear.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  liveStartsAt?: Date | null;

  @ApiPropertyOptional({
    example: 60,
    minimum: 1,
    maximum: 480,
    nullable: true,
    description: 'LIVE-kind lessons only. Pass null to clear.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  liveDurationMinutes?: number | null;

  @ApiPropertyOptional({
    example: 'https://meet.example.com/session-abc',
    nullable: true,
    description: 'LIVE-kind lessons only. Pass null to clear.',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  liveJoinUrl?: string | null;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    nullable: true,
    description: 'LIVE-kind lessons only. Pass null to clear.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  liveCapacity?: number | null;
}
