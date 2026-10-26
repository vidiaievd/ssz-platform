import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LearnerAiRemarkDto {
  @ApiProperty({ example: 'i2', description: 'The item (sentence, question, `text` of an essay) the remark is about.' })
  itemId!: string;

  @ApiProperty({ example: 1, description: 'Position of that item in the exercise, from 0.' })
  sentenceIndex!: number;

  @ApiProperty({
    example: 'grammar',
    description:
      'What the remark is about: `grammar`, `lexis`, `meaning`, `alternative` (your wording is right too), ' +
      '`task`, `structure`, `content` — the set depends on the template.',
  })
  aspect!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'har gå',
    description: 'The words of the answer the remark points at, verbatim; null for a remark about the answer as a whole.',
  })
  fragment!: string | null;

  @ApiProperty({ example: 'After «har» the verb takes the past participle.', description: 'The remark, addressed to the learner.' })
  comment!: string;

  @ApiPropertyOptional({ nullable: true, example: 'har gått', description: 'What to write instead, when there is one.' })
  suggestion!: string | null;
}

export class LearnerAiMarkDto {
  @ApiProperty({ example: 'c1', description: 'Rubric criterion id, as in the attempt’s `rubricSnapshot`.' })
  criterionId!: string;

  @ApiProperty({ enum: [0, 1, 2, 3], example: 2 })
  mark!: 0 | 1 | 2 | 3;

  @ApiProperty({ example: 'Most points of the task are covered; the closing is missing.', description: 'Why this mark.' })
  reason!: string;
}

export class LearnerReadingPromptDto {
  @ApiProperty({ example: 'p1aaaa', description: 'The prompt id.' })
  itemId!: string;

  @ApiProperty({ example: 'jeg har jobbet i kundeservice i tre år', description: 'What the recognizer heard, in its lexical form.' })
  transcript!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'The words heard with where in the recording: `{ text, startMs, endMs, confidence }`.',
  })
  words!: Array<{ text: string; startMs: number; endMs: number; confidence: number | null }>;

  @ApiPropertyOptional({ nullable: true, example: 12400, description: 'Length of the audio heard, ms.' })
  audioMs!: number | null;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'Pronunciation scores 0–100 `{ accuracy, fluency, completeness, prosody, words: [{ text, accuracy, error }] }` — ' +
      'feedback only, never part of the verdict. Null unless the plan has the pronunciation level.',
  })
  pronunciation!: unknown;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'The reading check (kernel `ReadingCheck`): `ops` in passage order — `read` `{ i, n, heard, focus }`, ' +
      '`misread` `{ i, expected, heard, focus }`, `missed` `{ i, expected, focus }`, `extra` `{ heard }` — and the counts ' +
      '`total`, `read`, `misread`, `missed`, `extra`, `accuracy` (0–1). `i` indexes the passage words.',
  })
  check!: unknown;

  @ApiProperty({ example: 80, description: 'Share of the passage words read, whole percent, rounded down.' })
  percent!: number;

  @ApiProperty({ example: false, description: 'Whether the prompt reached the pass mark.' })
  passed!: boolean;

  @ApiPropertyOptional({ nullable: true, example: 96, description: 'Words per minute over the speech heard — feedback only.' })
  wordsPerMinute!: number | null;
}

export class LearnerReadingDto {
  @ApiProperty({ example: 85, description: 'Share of a prompt’s words that passes it, whole percent.' })
  passPercent!: number;

  @ApiProperty({ type: [LearnerReadingPromptDto], description: 'The prompts checked, in the exercise’s order.' })
  prompts!: LearnerReadingPromptDto[];

  @ApiProperty({ type: [String], example: [], description: 'Prompts passed in an earlier try and carried into this one — not checked again.' })
  carriedItemIds!: string[];
}

export class LearnerAiReviewResponseDto {
  @ApiProperty({
    enum: ['approved', 'returned'],
    description: 'The verdict the review closed the attempt with — or, when `provisional`, would count as.',
  })
  outcome!: 'approved' | 'returned';

  @ApiProperty({ type: [LearnerAiRemarkDto] })
  items!: LearnerAiRemarkDto[];

  @ApiPropertyOptional({ nullable: true, description: 'The review’s word on the answer as a whole — also the attempt’s `reviewComment`.' })
  summary!: string | null;

  @ApiPropertyOptional({
    type: [LearnerAiMarkDto],
    nullable: true,
    description: 'For an essay graded out of a rubric: the marks behind its score, each with its reason. Null otherwise.',
  })
  marks!: LearnerAiMarkDto[] | null;

  @ApiPropertyOptional({
    type: LearnerReadingDto,
    nullable: true,
    description: 'For a reading aloud (plan 82): what was heard in each prompt and the check the verdict stood on. Null otherwise.',
  })
  reading!: LearnerReadingDto | null;

  @ApiProperty({ example: '2026-10-24T10:00:00.000Z' })
  reviewedAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'When I said this review is wrong (`POST …/ai-review/dispute`); null until I do.',
  })
  disputedAt!: string | null;

  @ApiProperty({
    example: false,
    description:
      'My school’s teacher has yet to answer (plan 80): the verdict does not count yet, and the client ' +
      'labels it «проверено ИИ, ждёт учителя». Not disputable — the teacher reads the work anyway.',
  })
  provisional!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: '2026-10-31T09:00:00.000Z',
    description: 'For a provisional verdict: when it counts by itself if no teacher answers. Null otherwise.',
  })
  countsAt!: string | null;

  @ApiProperty({
    example: false,
    description:
      'My school’s term ran out and no teacher answered, so this verdict counted by itself (plan 80) — ' +
      'the client labels it «засчитано автоматически». A teacher may still read the work later.',
  })
  acceptedAtTerm!: boolean;
}

export class DisputeAiReviewRequestDto {
  @ApiPropertyOptional({
    maxLength: 1000,
    example: 'Setning 2 er riktig — «i går var jeg» er det jeg skrev.',
    description: 'Why the review is wrong, in my words. Optional; stored with the review — analytics only hears that there was one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class DisputeAiReviewResponseDto {
  @ApiProperty({ example: '2026-10-24T12:00:00.000Z', description: 'When the review was disputed — the first press, on a repeat.' })
  disputedAt!: string;
}
