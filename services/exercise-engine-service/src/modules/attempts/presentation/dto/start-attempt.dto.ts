import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SegmentState } from '@ssz/shared-kernel/dictation';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import type { CheckMode } from '../../domain/entities/attempt.entity.js';

export class StartAttemptRequestDto {
  @ApiProperty({ description: 'Target language code for instructions (e.g. "no", "en")' })
  @IsString()
  @IsNotEmpty()
  language!: string;

  @ApiPropertyOptional({ description: 'Assignment ID linking this attempt to a tutor assignment' })
  @IsString()
  @IsOptional()
  assignmentId?: string;

  @ApiPropertyOptional({ description: 'Enrollment ID linking this attempt to a school enrollment' })
  @IsString()
  @IsOptional()
  enrollmentId?: string;

  @ApiPropertyOptional({
    description:
      'Scheduled lesson this attempt is being done in. Naming one marks the work as ' +
      'classwork; leaving it out means homework when an assignment is named, and the ' +
      "learner's own time otherwise.",
  })
  @IsString()
  @IsOptional()
  lessonId?: string;

  @ApiPropertyOptional({
    enum: ['PRACTICE', 'GRADED'],
    description:
      'PRACTICE ships expectedAnswers for instant local checking; GRADED withholds them. ' +
      'Defaults to GRADED when assignmentId is set, PRACTICE otherwise.',
  })
  @IsEnum(['PRACTICE', 'GRADED'])
  @IsOptional()
  mode?: CheckMode;

  @ApiPropertyOptional({
    description:
      'An attempt the caller has already been told is in progress, to be handed back ' +
      'rather than reported as a conflict. Only the caller\'s own in-progress attempt ' +
      'at this exercise is joined; anything else is ignored and the usual rules apply. ' +
      'This is how a second tab that lost the race to start joins the attempt the first ' +
      'one opened, instead of abandoning it out from under a learner who is using it.',
  })
  @IsUUID()
  @IsOptional()
  joinAttemptId?: string;
}

export class StartAttemptResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty()
  templateCode!: string;

  @ApiProperty()
  targetLanguage!: string;

  @ApiProperty()
  difficultyLevel!: string;

  @ApiProperty({ enum: ['PRACTICE', 'GRADED'] })
  checkMode!: string;

  @ApiProperty({ description: 'Exercise content — shape depends on templateCode' })
  exerciseContent!: unknown;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Expected answers — shape depends on templateCode; null when checkMode is GRADED',
  })
  expectedAnswers!: unknown;

  @ApiProperty({ description: 'JSON Schema for validating submitted answers' })
  answerSchema!: unknown;

  @ApiProperty({ description: 'Merged check settings (template defaults + exercise overrides)' })
  checkSettings!: Record<string, unknown>;

  @ApiProperty({
    description:
      'Answers already handed in on this attempt, oldest first. Empty for a fresh ' +
      'attempt; only `short_answer` takes answers before the attempt closes, so only ' +
      'a resumed set arrives with anything here.',
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

  @ApiProperty({
    description:
      'Sentences already worked on in this attempt — `sentence_schema` only, and empty ' +
      'for a fresh attempt. A resumed set puts the boards back from this. `revealed` ' +
      'cannot be recovered from anywhere else: the student was shown that sentence, and ' +
      'it scores nothing.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        rowId: { type: 'string' },
        attempts: { type: 'integer' },
        placement: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        solved: { type: 'boolean' },
        revealed: { type: 'boolean' },
      },
    },
  })
  checkedRows!: Array<{
    rowId: string;
    attempts: number;
    placement: Record<string, string[]>;
    solved: boolean;
    revealed: boolean;
  }>;

  @ApiProperty({
    description:
      'Questions already picked at in this attempt — `multiple_choice` only, and empty ' +
      'for a fresh attempt. A resumed set reads it to know which questions are finished ' +
      'and which options a 50/50 has already dimmed. `picks` is the score: only a ' +
      'first-attempt hit counts, so a reload must not hand out a fresh first try.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        questionId: { type: 'string' },
        picks: { type: 'array', items: { type: 'string' } },
        eliminated: { type: 'array', items: { type: 'string' } },
        correct: { type: 'boolean' },
        closed: { type: 'boolean' },
        revealed: { type: 'boolean' },
      },
    },
  })
  pickedOptions!: Array<{
    questionId: string;
    picks: string[];
    eliminated: string[];
    correct: boolean;
    closed: boolean;
    revealed: boolean;
  }>;
  @ApiProperty({
    description:
      'Questions already worked on in this attempt — `highlight_in_text` only, and empty ' +
      'for a fresh attempt. A resumed exercise reads it to put the rail back and to know ' +
      'which questions are closed and how many checks each has spent. The first check of ' +
      'each question is the record, so a reload must not hand out a fresh one.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        questionId: { type: 'string' },
        checks: { type: 'integer' },
        firstScore: { type: 'number', nullable: true },
        firstPassed: { type: 'boolean', nullable: true },
        passed: { type: 'boolean' },
        revealed: { type: 'boolean' },
        closed: { type: 'boolean' },
      },
    },
  })
  questionStates!: Array<{
    questionId: string;
    checks: number;
    firstScore: number | null;
    firstPassed: boolean | null;
    passed: boolean;
    revealed: boolean;
    closed: boolean;
  }>;

  @ApiProperty({
    description:
      'Segments already worked on in this attempt — `dictation` only, and empty for any ' +
      'other template or a fresh attempt. A resumed dictation reads it to put the rail back, ' +
      'to reopen the first segment still open on the check after its last with the last ' +
      'checked text in the field, and to draw the summary (last line, first-check score), the ' +
      'revealed sentences and the transcript drawer again. The first ' +
      'check of each segment is the record, so a reload must not hand out a fresh one.',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        segmentId: { type: 'string' },
        checks: { type: 'integer' },
        firstScore: { type: 'number', nullable: true, description: '0..1' },
        firstPassed: { type: 'boolean', nullable: true },
        passed: { type: 'boolean' },
        revealed: { type: 'boolean' },
        closed: { type: 'boolean' },
        lastText: { type: 'string', description: 'The last checked text' },
        lastCheckAt: { type: 'number', nullable: true, description: 'Epoch ms' },
        first: {
          type: 'object',
          nullable: true,
          description: 'The first check: word counters, error classes, wrong focus ids, ops',
        },
        last: {
          type: 'object',
          nullable: true,
          description: 'The last check as shown — pct, word counters, ops — for the summary line',
        },
        key: {
          type: 'object',
          nullable: true,
          description: 'The sentence with its reason and focus words, once revealed',
        },
        transcriptSlice: {
          type: 'string',
          nullable: true,
          description: 'The sentence for the transcript drawer, once the segment closed',
        },
      },
    },
  })
  segmentStates!: SegmentState[];

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'inflection_table: the last check of a table scored but not closed — every cell with its ' +
      'value and verdict, the frozen cells, the checks left. The details that check returned, ' +
      'so nothing the student was not shown; null for a fresh attempt and other templates.',
  })
  boardCheck!: Record<string, unknown> | null;
}
