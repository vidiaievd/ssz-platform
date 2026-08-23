import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AnswerQuestionRequestDto {
  @ApiProperty({ description: 'Which question of the set is being handed in' })
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @ApiProperty({ description: 'What the student wrote — a few words to three sentences' })
  @IsString()
  @IsNotEmpty()
  text!: string;
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

export class AnswerQuestionResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty({ description: 'Questions handed in so far, including this one' })
  answered!: number;

  @ApiProperty({ description: 'Answerable questions in the set' })
  total!: number;

  @ApiProperty({ type: AnswerQuestionResultDto })
  result!: AnswerQuestionResultDto;

  @ApiProperty({
    description: 'Whether this answer is on its way to a teacher, for the routing line',
  })
  routedForReview!: boolean;
}
