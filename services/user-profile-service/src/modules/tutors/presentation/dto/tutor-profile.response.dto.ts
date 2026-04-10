import { ApiProperty } from '@nestjs/swagger';
import type { TeachingLanguage } from '../../domain/value-objects/teaching-language.vo.js';

class TeachingLanguageDto {
  @ApiProperty({ example: 'en' })
  languageCode!: string;

  @ApiProperty({
    example: 'FLUENT',
    enum: ['NATIVE', 'FLUENT', 'ADVANCED', 'INTERMEDIATE'],
  })
  proficiency!: string;
}

export class TutorProfileResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  profileId!: string;

  @ApiProperty({ example: 25.0, nullable: true, required: false })
  hourlyRate?: number;

  @ApiProperty({ example: 3, nullable: true, required: false })
  yearsOfExperience?: number;

  @ApiProperty({ type: [TeachingLanguageDto] })
  teachingLanguages!: TeachingLanguage[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: string;
}
