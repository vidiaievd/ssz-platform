import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
}
