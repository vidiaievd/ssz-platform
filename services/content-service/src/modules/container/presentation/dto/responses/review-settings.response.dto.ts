import { ApiProperty } from '@nestjs/swagger';
import type { ContainerReviewSettingsResult } from '../../../application/queries/get-review-settings/get-container-review-settings.handler.js';

export class ContainerReviewSettingsResponseDto {
  @ApiProperty({ nullable: true, example: 24, description: 'What actually applies' })
  respondWithinHours!: number | null;

  @ApiProperty({
    nullable: true,
    example: 48,
    description: 'The school’s promise — what "inherit" means for this course',
  })
  inheritedHours!: number | null;

  @ApiProperty({ example: true })
  overridden!: boolean;

  static from(result: ContainerReviewSettingsResult): ContainerReviewSettingsResponseDto {
    return {
      respondWithinHours: result.respondWithinHours,
      inheritedHours: result.inheritedHours,
      overridden: result.overridden,
    };
  }
}
