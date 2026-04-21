import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GetVocabularyItemForDisplayRequestDto {
  @ApiProperty({
    example: 'en',
    description: "BCP-47 tag of the student's native / preferred translation language",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  translationLanguage: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeExamples?: boolean;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 20, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  examplesLimit?: number;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'When true, examples are chosen randomly (response is not cached).',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  examplesRandom?: boolean;

  @ApiPropertyOptional({
    example: ['ru', 'de'],
    description: "Student's known languages in preference order (used for translation fallback).",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentKnownLanguages?: string[];
}
