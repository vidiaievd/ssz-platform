import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DifficultyLevel } from '../../../../modules/container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../modules/container/domain/value-objects/visibility.vo.js';

/**
 * Abstract base DTO for all top-level catalog list endpoints.
 * Extend this class and add module-specific optional filters.
 *
 * tagIds filter uses OR semantics: returned entities match at least one
 * of the supplied tag IDs. Future enhancement: AND semantics opt-in.
 */
export abstract class CatalogFilterQueryDto {
  @ApiPropertyOptional({ example: 'no', description: 'BCP-47 language tag (2–10 chars)' })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  targetLanguage?: string;

  @ApiPropertyOptional({ example: 'A1', enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @ApiPropertyOptional({
    example: 'uuid1,uuid2',
    description:
      'Comma-separated tag UUIDs. Returns entities that have at least one of these tags (OR).',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  tagIds?: string[];

  @ApiPropertyOptional({ example: 'norwegian greetings', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ example: 'uuid-of-school' })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-user' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ example: 'public', enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

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

  @ApiPropertyOptional({
    example: 'created_at_desc',
    description:
      'Sort order: comma-separated tokens in the form field_direction. Up to 3 fields. ' +
      'Allowed fields vary per endpoint.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sort?: string;
}
