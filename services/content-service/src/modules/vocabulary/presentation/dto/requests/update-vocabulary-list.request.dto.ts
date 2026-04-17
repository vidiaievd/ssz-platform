import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class UpdateVocabularyListRequestDto {
  @ApiPropertyOptional({ example: 'Daily Norwegian — Advanced' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description.', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.description !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: 'B1', enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @ApiPropertyOptional({ example: 'uuid-of-new-cover-image', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.coverImageMediaId !== null)
  @IsUUID()
  coverImageMediaId?: string | null;

  @ApiPropertyOptional({ example: 'shared', enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  autoAddToSrs?: boolean;
}
