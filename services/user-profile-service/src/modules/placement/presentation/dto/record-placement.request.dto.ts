import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class RecordPlacementRequestDto {
  @ApiProperty({ example: 'uk', description: 'ISO 639-1 language code' })
  @IsString()
  @Matches(/^[a-z]{2}$/)
  language: string;

  @ApiProperty({ example: 'B1', description: 'CEFR level A1–C2' })
  @IsIn(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  cefrLevel: string;

  @ApiProperty({ example: 72, description: 'Score 0–100' })
  @IsInt()
  @Min(0)
  @Max(100)
  score: number;

  @ApiProperty({ enum: ['platform', 'membership'], example: 'platform' })
  @IsEnum(['platform', 'membership'])
  scope: 'platform' | 'membership';

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Required when scope=membership',
  })
  @IsOptional()
  @IsString()
  membershipId?: string;

  @ApiProperty({ example: 'platform', description: '"platform" or "school:{slug}"' })
  @IsString()
  sourceLabel: string;

  @ApiProperty({ example: '2026-06-15T10:00:00Z', description: 'When the test was taken (ISO 8601)' })
  @IsString()
  takenAt: string;
}
