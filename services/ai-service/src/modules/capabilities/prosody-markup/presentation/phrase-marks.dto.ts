import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';
import { MAX_SPANS, MAX_TEXT_LENGTH } from '../../../pronunciation/presentation/word-stresses.dto.js';

export class PhraseMarksRequestDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: "The material's owner school, whose `ai.authoring` pays; null — the author's own plan",
  })
  @ValidateIf((o: PhraseMarksRequestDto) => o.schoolId !== null)
  @IsUUID()
  schoolId!: string | null;

  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7', description: 'The author who asked' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'nb', description: 'Text language; only `nb` is marked, any other is refused' })
  @IsString()
  @Length(2, 8)
  language!: string;

  @ApiProperty({
    example: 'Jeg heter Anna. Er du fra Norge?',
    description: 'The whole text, as the caller counted its words in it',
  })
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  text!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
    example: [
      [0, 3],
      [4, 9],
      [10, 14],
      [16, 18],
      [19, 21],
      [22, 25],
      [26, 31],
    ],
    description:
      "The caller's words as `[start, end)` character offsets in `text`, in order (content-service: the kernel's `tokenize`)",
  })
  @IsArray()
  @ArrayMaxSize(MAX_SPANS)
  spans!: unknown[];
}

export class SuggestedBoundaryDto {
  @ApiProperty({ example: 2, description: 'Index into `spans` of the last word of the group' }) index!: number;
  @ApiProperty({ enum: ['rise', 'fall', 'level'] }) pitch!: string;
  @ApiProperty({ type: String, nullable: true, enum: ['short', 'long'], description: 'Null — no pause' })
  pause!: string | null;
}

export class PhraseMarksDto {
  @ApiProperty({
    type: [Number],
    example: [2, 6],
    description: 'Words carrying a phrase accent, one per group at most',
  })
  accents!: number[];
  @ApiProperty({ type: [SuggestedBoundaryDto], description: 'Every group end, in order' })
  boundaries!: SuggestedBoundaryDto[];
  @ApiProperty({
    type: [Number],
    example: [],
    description: 'Word `index` runs into word `index + 1`; never across punctuation or a group end',
  })
  links!: number[];
}

export class PhraseMarksResponseDto {
  @ApiProperty({ enum: ['ok', 'refused', 'failed'] }) status!: string;
  @ApiPropertyOptional({ type: PhraseMarksDto, description: 'When ok' }) marks?: PhraseMarksDto;
  @ApiPropertyOptional({
    enum: ['language_not_supported', 'no_words', 'too_long', 'not_available', 'pool_empty'],
    description: 'When refused',
  })
  reason?: string;
  @ApiPropertyOptional({ example: 'invalid_response', description: 'When failed' }) errorCode?: string;
  @ApiPropertyOptional({ type: [String], description: 'Ledger rows of the calls made' }) aiCallIds?: string[];
}
