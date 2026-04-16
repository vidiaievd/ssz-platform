import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';

export class GetBestVariantRequestDto {
  @ApiProperty({
    example: 'en',
    description: "BCP-47 tag for the student's native / preferred explanation language.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  studentNativeLanguage: string;

  @ApiProperty({ example: 'A2', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  studentCurrentLevel: DifficultyLevel;

  @ApiPropertyOptional({
    example: ['de', 'fr'],
    description: 'Additional languages the student knows, in preference order.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(10, { each: true })
  studentKnownLanguages?: string[];
}
