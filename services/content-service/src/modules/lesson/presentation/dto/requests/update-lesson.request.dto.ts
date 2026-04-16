import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class UpdateLessonRequestDto {
  @ApiPropertyOptional({ example: 'Greetings and Introductions (Revised)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated description.',
    nullable: true,
    description: 'Pass null to clear the description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: 'A2', enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel;

  @ApiPropertyOptional({
    example: 'uuid-of-new-cover-image',
    nullable: true,
    description: 'Pass null to remove the cover image.',
  })
  @IsOptional()
  @IsUUID()
  coverImageMediaId?: string | null;

  @ApiPropertyOptional({ example: 'shared', enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}
