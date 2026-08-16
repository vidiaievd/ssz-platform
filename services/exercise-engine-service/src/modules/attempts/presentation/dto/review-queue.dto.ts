import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** A course of a few hundred, a school of a few dozen groups — past this the caller is guessing. */
const MAX_SCOPE_IDS = 500;

/**
 * The area a reviewer is asking about.
 *
 * A POST for a read, as with the queue it replaces: the filter is a list of ids that does
 * not fit a query string, and the body keeps groups and courses out of access logs.
 */
export class ReviewQueueScopeDto {
  /**
   * Required in every real sense — but validated in the controller rather than here, so
   * that "no school" and "a school with nothing to narrow it" come back as the same 422.
   * They are one mistake: a queue query that has not said what it may see.
   */
  @ApiProperty({ description: 'The school whose submissions to read — never optional' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  schoolId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Groups the reviewer teaches' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_IDS)
  @IsString({ each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Top-level courses to narrow to' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_IDS)
  @IsString({ each: true })
  containerIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Only these exercise templates' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_IDS)
  @IsString({ each: true })
  templateCodes?: string[];
}

export class ReviewQueueRequestDto extends ReviewQueueScopeDto {
  @ApiPropertyOptional({ enum: ['exercise', 'student'], default: 'exercise' })
  @IsOptional()
  @IsIn(['exercise', 'student'])
  groupBy?: 'exercise' | 'student';

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque token from a previous page' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;
}
