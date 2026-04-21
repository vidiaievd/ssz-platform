import { ApiProperty } from '@nestjs/swagger';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonVariantResponseDto } from './lesson-variant.response.dto.js';

export class BestVariantResponseDto {
  @ApiProperty({ type: () => LessonVariantResponseDto })
  variant: LessonVariantResponseDto;

  @ApiProperty({
    example: false,
    description:
      "True when no variant exactly matched the student's level range; a closest-match was used instead.",
  })
  fallbackUsed: boolean;

  static from(variant: LessonContentVariantEntity, fallbackUsed: boolean): BestVariantResponseDto {
    const dto = new BestVariantResponseDto();
    dto.variant = LessonVariantResponseDto.from(variant);
    dto.fallbackUsed = fallbackUsed;
    return dto;
  }
}
