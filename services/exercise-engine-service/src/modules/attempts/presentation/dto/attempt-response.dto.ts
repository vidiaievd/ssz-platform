import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttemptResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  exerciseId!: string;

  @ApiPropertyOptional({ nullable: true })
  assignmentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  enrollmentId!: string | null;

  @ApiProperty()
  templateCode!: string;

  @ApiProperty()
  targetLanguage!: string;

  @ApiProperty()
  difficultyLevel!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  score!: number | null;

  @ApiPropertyOptional({ nullable: true })
  passed!: boolean | null;

  @ApiProperty()
  timeSpentSeconds!: number;

  @ApiProperty()
  startedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  submittedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  scoredAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  feedback!: unknown;
}

export class ListAttemptsResponseDto {
  @ApiProperty({ type: [AttemptResponseDto] })
  items!: AttemptResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
