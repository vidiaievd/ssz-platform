import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';

export class SelfCheckRequestDto {
  @ApiProperty({
    description:
      'The work so far, in the same shape a submission carries. error_correction: ' +
      '{ items: { <itemId>: { marked, fix, ins } } }. translate_*: ' +
      '{ answers: [{ itemId, text }] }. Nothing is submitted — the attempt stays in progress.',
  })
  @Allow()
  draftAnswer!: unknown;
}

export class SelfCheckItemDto {
  @ApiProperty()
  itemId!: string;

  @ApiProperty({ description: 'Mistakes corrected so far in this item' })
  fixedCount!: number;

  @ApiProperty({ description: 'Mistakes in this item' })
  spanCount!: number;

  @ApiProperty({
    type: [Boolean],
    description:
      'One flag per mistake, in sentence order: corrected or not. Says *that* a mistake ' +
      'is open, never where it is — the runner draws these as pips.',
  })
  fixedSpans!: boolean[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Types of the mistakes still open. Only when the author enabled hints.showType.',
  })
  remainingTypes?: string[];

  @ApiProperty({
    description: 'How many edits landed where there was no mistake at all',
  })
  strayEdits!: number;
}

export class TranslateSelfCheckItemDto {
  @ApiProperty()
  itemId!: string;

  @ApiProperty({
    enum: ['exact', 'typo', 'near', 'off', 'empty', 'noref'],
    description: 'How close the sentence is to the closest accepted translation',
  })
  verdict!: string;

  @ApiProperty({ description: 'Similarity to that translation, 0…1. A bar, not a grade' })
  sim!: number;

  @ApiPropertyOptional({
    description:
      'Word-level diff against the closest accepted translation. Every word of the key ' +
      'the student has not written is replaced by «•••» — otherwise repeated self-checks ' +
      'would spell the key out. Absent for the «off» verdict.',
  })
  tokens?: { t: string; w: string; typo: string | null }[];

  @ApiPropertyOptional({ description: 'Only for «off»: how many words differ' })
  divergingWords?: number;

  @ApiProperty({
    description:
      'Rules of the task the answer does not meet, with the author’s explanation of each. ' +
      'The one thing this template can say is wrong without inventing a reason.',
  })
  missing!: { text: string; note?: string }[];

  @ApiProperty({ description: 'Forbidden wordings the answer uses, with their explanations' })
  banned!: { text: string; note?: string }[];
}

export class SelfCheckResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty({ description: 'Self-checks spent on this attempt, including this one' })
  checksUsed!: number;

  @ApiProperty({ description: 'Self-checks still available' })
  checksLeft!: number;

  @ApiProperty({
    description: 'Which of the two self-checkable templates this is; the items follow it',
    enum: ['error_correction', 'translate_to_target', 'translate_from_target'],
  })
  templateCode!: string;

  @ApiProperty({
    description: 'error_correction items, or translate items — see templateCode',
    oneOf: [
      { type: 'array', items: { $ref: '#/components/schemas/SelfCheckItemDto' } },
      { type: 'array', items: { $ref: '#/components/schemas/TranslateSelfCheckItemDto' } },
    ],
  })
  items!: SelfCheckItemDto[] | TranslateSelfCheckItemDto[];

  @ApiPropertyOptional({ description: 'error_correction: mistakes corrected across every item' })
  fixedCount?: number;

  @ApiPropertyOptional({ description: 'error_correction: mistakes across every item' })
  spanCount?: number;

  @ApiPropertyOptional({
    description: 'translate_*: sentences a hit on the key would close on its own',
  })
  passing?: number;
}
