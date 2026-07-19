import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateExplanationRequestDto {
  @ApiPropertyOptional({ example: 'Present Tense — Updated Title' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayTitle?: string;

  @ApiPropertyOptional({ example: 'Updated summary.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  displaySummary?: string | null;

  @ApiPropertyOptional({ example: '## Updated markdown...' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bodyMarkdown?: string;

  @ApiPropertyOptional({ example: 10, nullable: true, minimum: 1, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  estimatedReadingMinutes?: number | null;

  @ApiPropertyOptional({ example: 'Jeg spiser epler hver dag.', nullable: true })
  @IsOptional()
  @IsString()
  anchorText?: string | null;

  @ApiPropertyOptional({ example: ['spiser'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  anchorHighlights?: string[];

  @ApiPropertyOptional({ example: 'Notice the -er ending.', nullable: true })
  @IsOptional()
  @IsString()
  anchorNote?: string | null;
}
