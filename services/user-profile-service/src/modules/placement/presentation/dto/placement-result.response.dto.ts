import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlacementResultResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'uk' })
  language: string;

  @ApiProperty({ example: 'B1' })
  cefrLevel: string;

  @ApiProperty({ example: 72 })
  score: number;

  @ApiProperty({ enum: ['platform', 'membership'], example: 'platform' })
  scope: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  membershipId?: string;

  @ApiProperty({ example: 'platform' })
  sourceLabel: string;

  @ApiProperty()
  takenAt: Date;

  @ApiProperty()
  createdAt: Date;
}
