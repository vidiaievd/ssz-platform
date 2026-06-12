import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TeachingLanguageDto {
  @ApiProperty({ example: 'nb', description: 'ISO 639-1 language code' })
  code!: string;

  @ApiPropertyOptional({ example: 'C2', description: 'CEFR proficiency level', nullable: true })
  level!: string | null;
}

export class TeachingProfileResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  userId!: string;

  @ApiProperty({ type: [TeachingLanguageDto] })
  languages!: TeachingLanguageDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
