import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';

export class SelfCheckRequestDto {
  @ApiProperty({
    description:
      'The work so far, in the same shape a submission carries: { items: { <itemId>: ' +
      '{ marked, fix, ins } } }. Nothing is submitted — the attempt stays in progress.',
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

export class SelfCheckResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty({ description: 'Self-checks spent on this attempt, including this one' })
  checksUsed!: number;

  @ApiProperty({ description: 'Self-checks still available' })
  checksLeft!: number;

  @ApiProperty({ type: [SelfCheckItemDto] })
  items!: SelfCheckItemDto[];

  @ApiProperty({ description: 'Mistakes corrected across every item' })
  fixedCount!: number;

  @ApiProperty({ description: 'Mistakes across every item' })
  spanCount!: number;
}
