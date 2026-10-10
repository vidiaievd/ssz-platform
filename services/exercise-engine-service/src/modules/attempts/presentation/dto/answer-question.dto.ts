import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AudioTranscriptDto } from './audio-transcript.dto.js';
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
    description: 'multiple_choice: the option the student picked. minimal_pairs: the word they heard',
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

export class RevealedProbeOptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Every button is spelled once the probe closes' })
  text!: string;

  @ApiPropertyOptional({ description: 'Unless meaning is «never» shown' })
  gloss?: string;

  @ApiPropertyOptional({ description: 'When IPA is on' })
  ipa?: string;
}

export class ProbeCompareDto {
  @ApiProperty({ description: 'A signed link to the clip of the word the student chose' })
  chosen!: string;

  @ApiProperty({ description: 'A signed link to the clip that was played' })
  target!: string;
}

/**
 * What one answer to a `minimal_pairs` probe comes back with — plan 72 §3.6.
 *
 * The key, the spelling of every button and the A/B links arrive only once the probe closes —
 * right, or out of tries. On a miss with a second chance left the student hears the same clip
 * again and is told only that it was not right.
 */
export class AnswerQuestionProbeResultDto {
  @ApiProperty({ example: 'p3' })
  questionId!: string;

  @ApiProperty()
  n!: number;

  @ApiProperty({ description: 'The option that was judged' })
  optionId!: string;

  @ApiProperty()
  correct!: boolean;

  @ApiProperty({ description: 'Right, or no tries left' })
  closed!: boolean;

  @ApiProperty({ description: 'Answers given to this probe, this one included' })
  tries!: number;

  @ApiProperty({ description: 'Tries left on this probe after this one' })
  triesLeft!: number;

  @ApiProperty({ description: 'Whether the first answer was right — the only one that scores' })
  firstCorrect!: boolean;

  @ApiPropertyOptional({ description: 'The word that was played. Only once the probe closes' })
  keyOptionId?: string;

  @ApiPropertyOptional({ type: [RevealedProbeOptionDto], description: 'Only once the probe closes' })
  options?: RevealedProbeOptionDto[];

  @ApiPropertyOptional({
    type: ProbeCompareDto,
    description: 'On a closed miss with A/B comparison on: the two clips to play back to back',
  })
  compare?: ProbeCompareDto;
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
      { $ref: '#/components/schemas/AnswerQuestionProbeResultDto' },
    ],
    description: 'Read according to `templateCode`',
  })
  result!: AnswerQuestionResultDto | AnswerQuestionChoiceResultDto | AnswerQuestionProbeResultDto;

  @ApiPropertyOptional({
    type: AudioTranscriptDto,
    description:
      'What the clip said. Present only for a listening exercise with transcriptWhen=after, ' +
      'and only once the exercise is finished — one clip covers the whole set.',
  })
  audioTranscript?: AudioTranscriptDto;

  @ApiProperty({
    description: 'Whether this answer is on its way to a teacher, for the routing line',
  })
  routedForReview!: boolean;
}
