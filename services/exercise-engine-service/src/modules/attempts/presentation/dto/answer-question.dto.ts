import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * One item of a set, handed in.
 *
 * Two templates answer this way and they hand in different things, so the body carries
 * `text` **or** `optionId` and the attempt's own template decides which is read. Neither
 * is required at this layer — a missing one is refused by the handler, where the message
 * can say what this exercise is answered with rather than that a field failed a decorator.
 */
export class AnswerQuestionRequestDto {
  @ApiProperty({ description: 'Which question of the set is being handed in' })
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @ApiPropertyOptional({
    description:
      'short_answer: what the student wrote — a few words to three sentences',
  })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    description: 'multiple_choice: the option the student picked',
  })
  @IsOptional()
  @IsString()
  optionId?: string;

  @ApiPropertyOptional({
    description:
      'multiple_choice: the student pressed «Vis svaret» instead of trying again. Closes ' +
      'the question and returns the key; spends no attempt and scores nothing',
  })
  @IsOptional()
  @IsBoolean()
  reveal?: boolean;
}

export class AnswerQuestionElementDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: "What the answer had to say, in the teacher's words" })
  label!: string;

  @ApiProperty({ description: 'Optional elements are shown but never block a pass' })
  required!: boolean;

  @ApiProperty({ description: 'Whether the answer said it' })
  hit!: boolean;
}

export class AnswerQuestionResultDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty({
    enum: ['pass', 'partial', 'fail'],
    description: 'Derived from how many of the required elements the answer covered',
  })
  verdict!: string;

  @ApiProperty({ description: 'Required elements the answer covered' })
  covered!: number;

  @ApiProperty({ description: 'Required elements in total — the M in «N av M punkter dekket»' })
  total!: number;

  @ApiProperty({
    description:
      'Below the author’s minimum word count. Caps a pass at «partial»; never fails an ' +
      'answer on its own, and the student is shown no counter',
  })
  tooShort!: boolean;

  @ApiProperty({
    type: [AnswerQuestionElementDto],
    description:
      'One row per element, when the author enabled the breakdown. The phrases the ' +
      'matcher looks for are never here — they are the answer',
  })
  hits!: AnswerQuestionElementDto[];

  @ApiProperty({ description: 'The teacher’s explanation, shown under every verdict' })
  why!: string;

  @ApiPropertyOptional({
    description: 'The author’s own answer. Absent entirely when showModel is «never»',
  })
  model?: string;
}

/**
 * What one pick of a `multiple_choice` set comes back with — plan 53 §3.3, point 3.
 *
 * The optional fields are the whole contract. `keyOptionId` and `why` arrive **only once
 * the question closes**: sending them with a wrong pick that still has a try left would
 * make the retry and the 50/50 into theatre (IMPLEMENTATION.md, "Grading payload").
 */
export class AnswerQuestionChoiceResultDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty({ description: 'The option that was judged' })
  optionId!: string;

  @ApiProperty()
  correct!: boolean;

  @ApiProperty({ description: '1-based. Only a hit on attempt 1 scores' })
  attempt!: number;

  @ApiProperty({ description: 'Tries left on this question after this one' })
  attemptsLeft!: number;

  @ApiProperty({
    description: 'No further pick is possible: right, revealed, or the budget is spent',
  })
  closed!: boolean;

  @ApiPropertyOptional({
    description: 'The correct option. Present only when the question is closed',
  })
  keyOptionId?: string;

  @ApiPropertyOptional({
    description: 'The rule behind the right answer. Present only when it may be shown',
  })
  why?: string;

  @ApiPropertyOptional({ description: 'The rebuttal of the option that was picked' })
  optionWhy?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'The 50/50: options to dim. Cumulative, and only on a wrong pick with a try left. ' +
      'The key and exactly one distractor always survive',
  })
  eliminated?: string[];
}

export class AnswerQuestionResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty({
    description:
      'Which shape `result` came back in — short_answer and multiple_choice hand back ' +
      'different verdicts',
  })
  templateCode!: string;

  @ApiProperty({ description: 'Questions handed in so far, including this one' })
  answered!: number;

  @ApiProperty({ description: 'Answerable questions in the set' })
  total!: number;

  @ApiProperty({
    oneOf: [
      { $ref: '#/components/schemas/AnswerQuestionResultDto' },
      { $ref: '#/components/schemas/AnswerQuestionChoiceResultDto' },
    ],
    description: 'Read according to `templateCode`',
  })
  result!: AnswerQuestionResultDto | AnswerQuestionChoiceResultDto;

  @ApiProperty({
    description: 'Whether this answer is on its way to a teacher, for the routing line',
  })
  routedForReview!: boolean;
}
