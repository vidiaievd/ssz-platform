import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { LanguageLevel } from '@prisma/client';

export class TutorsFilterDto {
  @ApiPropertyOptional({ example: 'no', description: 'Filter by teaching language (ISO 639-1)' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ enum: LanguageLevel, description: 'Filter by level taught' })
  @IsOptional()
  @IsEnum(LanguageLevel)
  level?: LanguageLevel;

  @ApiPropertyOptional({ example: 30, description: 'Maximum hourly rate' })
  @IsOptional()
  @Type(() => Number)
  maxRate?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}
