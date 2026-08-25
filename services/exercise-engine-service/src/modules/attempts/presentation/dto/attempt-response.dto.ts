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

  @ApiProperty({
    description:
      'Questions of a `short_answer` set already handed in on this attempt, oldest ' +
      'first. Empty for every other template — it is the only one that takes answers ' +
      'before the attempt closes. A runner re-entering a set reads this to know which ' +
      'question it is on; the texts are the learner\'s own and the verdicts are the ' +
      'ones they were already shown.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        questionId: { type: 'string' },
        text: { type: 'string' },
        verdict: { type: 'string', enum: ['pass', 'partial', 'fail'] },
      },
    },
  })
  answeredQuestions!: Array<{ questionId: string; text: string; verdict: string }>;

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

  @ApiPropertyOptional({
    nullable: true,
    description:
      'The mark 0-3 the teacher set per criterion, for the templates graded out of a ' +
      'rubric. Null until a verdict has been delivered: an unmarked rubric is not a ' +
      'row of zeroes, and a learner shown one would read a grade nobody gave.',
  })
  rubricMarks!: unknown;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'The criteria those marks were set against, frozen when the work was queued — ' +
      'name, description, weight and the four level descriptors. Sent only alongside a ' +
      'delivered verdict, which is what makes the descriptors safe to show: before the ' +
      'mark they are part of the answer key (plan 50 §4).',
  })
  rubricSnapshot!: unknown;

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
