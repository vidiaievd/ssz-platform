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

  @ApiProperty({ description: 'PRACTICE or GRADED, fixed when the attempt started' })
  checkMode!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "The learner's own answer, exactly as submitted. Shape depends on templateCode. " +
      'Always returned — it is what they typed, read back to them.',
  })
  submittedAnswer!: unknown;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Validator output for the submission. PRACTICE attempts only: some validators ' +
      'put the expected answer in here, and a GRADED attempt withheld it by design.',
  })
  validationDetails!: unknown;

  @ApiProperty({ description: 'Whether the learner asked to be shown the answers.' })
  answersRevealed!: boolean;
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
