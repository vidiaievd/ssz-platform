import { ApiProperty } from '@nestjs/swagger';

class TeachingLanguageItemDto {
  @ApiProperty({ example: 'en' })
  languageCode!: string;

  @ApiProperty({
    example: 'FLUENT',
    enum: ['NATIVE', 'FLUENT', 'ADVANCED', 'INTERMEDIATE'],
  })
  proficiency!: string;
}

class TutorListItemResponseDto {
  @ApiProperty({ example: 'uuid' })
  profileId!: string;

  @ApiProperty({ example: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Jane Smith' })
  displayName!: string;

  @ApiProperty({ example: 'Jane', required: false, nullable: true })
  firstName?: string;

  @ApiProperty({ example: 'Smith', required: false, nullable: true })
  lastName?: string;

  @ApiProperty({
    example: 'https://cdn.example.com/avatar.jpg',
    required: false,
    nullable: true,
  })
  avatarUrl?: string;

  @ApiProperty({
    example: 'Experienced English teacher.',
    required: false,
    nullable: true,
  })
  bio?: string;

  @ApiProperty({ example: 25.0, required: false, nullable: true })
  hourlyRate?: number;

  @ApiProperty({ example: 3, required: false, nullable: true })
  yearsOfExperience?: number;

  @ApiProperty({ type: [TeachingLanguageItemDto] })
  teachingLanguages!: TeachingLanguageItemDto[];
}

export class TutorListResponseDto {
  @ApiProperty({ type: [TutorListItemResponseDto] })
  items!: TutorListItemResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;
}
