import { ApiProperty } from '@nestjs/swagger';

export class StudentProfileResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  profileId!: string;

  @ApiProperty({ example: 'uk', nullable: true, required: false })
  nativeLanguage?: string;

  @ApiProperty({ example: ['en', 'de'], type: [String] })
  targetLanguages!: string[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: string;
}
