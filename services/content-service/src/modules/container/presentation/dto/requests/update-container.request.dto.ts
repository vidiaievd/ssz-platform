import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import { LevelSystem } from '../../../domain/value-objects/level-system.vo.js';
import { GatingMode } from '../../../domain/value-objects/gating-mode.vo.js';

export class UpdateContainerRequestDto {
  @ApiPropertyOptional({ example: 'A1', enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @ApiPropertyOptional({ example: 'Norwegian for Beginners' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'A comprehensive course for absolute beginners.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  @IsOptional()
  @IsUUID()
  coverImageMediaId?: string;

  @ApiPropertyOptional({ example: 'public', enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ example: 'public_free', enum: AccessTier })
  @IsOptional()
  @IsEnum(AccessTier)
  accessTier?: AccessTier;

  @ApiPropertyOptional({ example: 'cefr', enum: LevelSystem })
  @IsOptional()
  @IsEnum(LevelSystem)
  levelSystem?: LevelSystem;

  @ApiPropertyOptional({
    example: 'open',
    enum: GatingMode,
    description: 'Course-only: how sub-lessons unlock for students.',
  })
  @IsOptional()
  @IsEnum(GatingMode)
  gatingMode?: GatingMode;
}
