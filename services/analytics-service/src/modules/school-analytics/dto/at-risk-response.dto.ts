import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AtRiskStudentDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Maria Singh' })
  name!: string;

  @ApiPropertyOptional({ example: 'Spanish Beginner (A1)' })
  course?: string;

  @ApiPropertyOptional({ example: '2026-05-26T10:00:00.000Z', description: 'ISO timestamp of last activity, null if never active' })
  lastSeen?: string | null;

  @ApiProperty({ example: 0.35, description: 'Share 0.0–1.0 of the published items of the student’s active courses they have completed (0 when the courses’ items are unknown)' })
  progress!: number;

  @ApiPropertyOptional({ example: 'es', description: 'Target language of primary enrolled course' })
  lang?: string;
}

export class GetAtRiskResponseDto {
  @ApiProperty({ type: [AtRiskStudentDto] })
  students!: AtRiskStudentDto[];

  @ApiProperty({ example: 12, description: 'Total at-risk count (before limit)' })
  total!: number;
}
