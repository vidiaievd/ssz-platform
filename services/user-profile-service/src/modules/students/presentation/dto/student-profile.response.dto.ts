import { ApiProperty } from '@nestjs/swagger';

export class TargetLanguageResponseDto {
  @ApiProperty({ example: 'nb' })
  code!: string;

  @ApiProperty({
    example: 'B1',
    nullable: true,
    required: false,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  })
  level?: string;
}

export class StudentProfileResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  profileId!: string;

  @ApiProperty({ example: 'uk', nullable: true, required: false })
  nativeLanguage?: string;

  @ApiProperty({ type: [TargetLanguageResponseDto] })
  targetLanguages!: TargetLanguageResponseDto[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: string;
}
