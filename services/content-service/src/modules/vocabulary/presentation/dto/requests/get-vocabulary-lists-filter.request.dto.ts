import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class GetVocabularyListsFilterRequestDto {
  @ApiPropertyOptional({ example: 'no', description: 'BCP-47 language tag' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  targetLanguage?: string;

  @ApiPropertyOptional({ example: 'A1', enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @ApiPropertyOptional({ example: 'public', enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ example: 'uuid-of-owner-user' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school' })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;

  @ApiPropertyOptional({ example: 'daily' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'createdAt', description: 'Sort field' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string;
}
