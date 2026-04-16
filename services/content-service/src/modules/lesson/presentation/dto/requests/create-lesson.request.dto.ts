import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class CreateLessonRequestDto {
  @ApiProperty({ example: 'no', description: 'BCP-47 language tag of the target language' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage: string;

  @ApiProperty({ example: 'A1', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  difficultyLevel: DifficultyLevel;

  @ApiProperty({ example: 'Greetings and Introductions' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Learn how to greet people in Norwegian.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  @IsOptional()
  @IsUUID()
  coverImageMediaId?: string;

  @ApiPropertyOptional({
    example: 'uuid-of-owner-school',
    description:
      'When provided the lesson belongs to a school; otherwise to the authenticated user.',
  })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;

  @ApiProperty({ example: 'public', enum: Visibility })
  @IsEnum(Visibility)
  visibility: Visibility;
}
