import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_READING_PASS_PERCENT, MIN_READING_PASS_PERCENT } from '@ssz/shared-kernel/read-aloud';

/** A passage and what was heard in its take. */
export class ReadingToCheckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  itemId!: string;

  @IsString()
  @MaxLength(10000)
  text!: string;

  /** The lexical form where the provider has one; empty when it heard nothing. */
  @IsString()
  @MaxLength(10000)
  transcript!: string;
}

/** One reading's prompts to check under one mark (plan 82, step 10). */
export class CheckReadingsDto {
  /** The course language (`nb`) — picks the check's number words. */
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  language!: string;

  @IsInt()
  @Min(MIN_READING_PASS_PERCENT)
  @Max(MAX_READING_PASS_PERCENT)
  passPercent!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ReadingToCheckDto)
  prompts!: ReadingToCheckDto[];
}
