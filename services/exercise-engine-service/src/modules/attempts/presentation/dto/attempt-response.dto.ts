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

  @ApiPropertyOptional({
    nullable: true,
    description:
      'The unfinished answer, as last autosaved. This is what a runner reloads into ' +
      'the page after a closed tab or a dead battery. Null once the attempt is no ' +
      'longer in progress, and null for a runner that never saved one.',
  })
  draftAnswer!: unknown;

  @ApiPropertyOptional({ nullable: true, description: 'When the draft was last taken.' })
  draftSavedAt!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "The teacher's word on the submission as a whole, once one has read it. Written " +
      'for the learner — the only place this template can say why something was wrong.',
  })
  reviewComment!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'What the teacher decided per item: Array<{ itemId, approved, comment? }>. Carries ' +
      'no answer key — only the verdict and the words the teacher chose to write.',
  })
  reviewDecisions!: unknown;

  @ApiPropertyOptional({ nullable: true, description: 'When a teacher read it.' })
  reviewedAt!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Which teacher read it. An id, so that a client can put a name to a verdict — the ' +
      'learner is already told who marked their work on their own submissions screen.',
  })
  reviewedByUserId!: string | null;
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
