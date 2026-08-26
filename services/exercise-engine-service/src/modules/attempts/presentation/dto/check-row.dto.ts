import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CheckRowRequestDto {
  @ApiProperty({ description: 'Which sentence of the set is being checked' })
  @IsString()
  @IsNotEmpty()
  rowId!: string;

  @ApiProperty({
    description:
      'The board: field id → the ids stacked in it, in the order they were placed. ' +
      'Order inside a field is graded unless the author turned it off',
    example: { forfelt: ['c1'], verbal: ['c2'], midtfelt: ['c3', 'c4'] },
  })
  @IsObject()
  placement!: Record<string, string[]>;

  @ApiPropertyOptional({
    description:
      'The student pressed «Vis riktig skjema». The sentence closes with the solution ' +
      'shown and scores nothing — it was shown, not solved',
  })
  @IsOptional()
  @IsBoolean()
  reveal?: boolean;
}

export class CheckRowResultDto {
  @ApiProperty()
  rowId!: string;

  @ApiProperty({ description: 'Which check this was, 1-based — the «Forsøk N» counter' })
  attempt!: number;

  @ApiProperty({
    description:
      'One mark per placed piece: ok, field (a piece of this sentence in a field the ' +
      'key does not accept), order, or extra (a distractor)',
    example: { c1: 'ok', c2: 'field' },
  })
  byItem!: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'One mark per field: ok, bad, or empty (unmarked). Null when the author turned ' +
      'per-field marking off — the sentence-level verdict still stands',
    example: { forfelt: 'ok', verbal: 'bad' },
  })
  byField?: Record<string, string> | null;

  @ApiProperty({ description: 'Wrong pieces plus required fields left empty' })
  wrong!: number;

  @ApiProperty()
  solved!: boolean;

  @ApiProperty({ description: '0–100 for this sentence. A revealed sentence is worth nothing' })
  score!: number;

  @ApiPropertyOptional({
    description: 'The rule behind the sentence. Present once it is closed, withheld while open',
  })
  why?: string | null;

  @ApiPropertyOptional({
    description:
      'The sentence in its correct order. Same rule as the rule itself — it is the word ' +
      'order written out, which is the answer',
  })
  text?: string | null;

  @ApiPropertyOptional({ description: 'The full board, on a reveal only' })
  solution?: Record<string, string[]> | null;

  @ApiPropertyOptional({
    description:
      'The one note under the board, resolved on the server: the author’s own words ' +
      'where they wrote some (source «override» or «why»), otherwise a code to render ' +
      '(source «default»). The chain runs over the answer key, so a client cannot resolve it',
  })
  banner?: {
    source: string;
    text: string;
    code: string | null;
    hint: string;
  } | null;
}

export class CheckRowResponseDto {
  @ApiProperty()
  attemptId!: string;

  @ApiProperty({ description: 'Sentences closed — solved or revealed — including this one' })
  closed!: number;

  @ApiProperty({ description: 'Sentences in the set' })
  total!: number;

  @ApiProperty({ type: CheckRowResultDto })
  result!: CheckRowResultDto;
}
