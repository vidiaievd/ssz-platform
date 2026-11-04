import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Exactly one of `notation` and `layer`; the controller refuses both or neither. */
export class SetProsodyRequestDto {
  @ApiPropertyOptional({
    description:
      "The whole text with its marks (plan 86, §4a): `'1` / `'2` before the stressed syllable, " +
      "a bare `'` before a stressed monosyllable, `'0` before a word with no stress, `^` phrase " +
      'accent; `/` `\\` `~` group end (rise, fall, level), `|` `||` pause and `_` linking as words ' +
      'of their own. Without its marks it must equal the current text character for character. ' +
      'The text alone clears the layer. Every mark is stored with source `teacher`.',
    example: "Jeg '1heter ^'1Anna \\ | og jeg '2snakker _ litt 'norsk \\ ||",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  notation?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      "Plan 86, step 6h.2b — the editor's form: a `ProsodyLayer` of `@ssz/shared-kernel/prosody` " +
      'anchored to the current text (`tokenizer`, `stresses`, `unstressed`, `accents`, `boundaries`, ' +
      "`links`, `orphans`). Keeps each mark's source, `teacher` or `ai`; `lexicon` is refused — the " +
      "lexicon's words are merged on read, never stored. Unknown fields are dropped. A layer without " +
      'marks clears it.',
    example: {
      tokenizer: 'unicode-word-v1',
      stresses: [],
      unstressed: [{ i: 0, w: 'Bartek', source: 'teacher' }],
      accents: [{ i: 3, w: 'jobb', source: 'ai' }],
      boundaries: [{ i: 3, w: 'jobb', pitch: 'fall', pause: 'long', source: 'ai' }],
      links: [],
      orphans: [],
    },
  })
  @IsOptional()
  @IsObject()
  layer?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-11-04T10:12:03.114Z',
    description:
      'The `updatedAt` the editor last read; `null` when it read no stored layer. When it no ' +
      'longer matches, the write is refused with 409 and `currentUpdatedAt`. Omit it to write ' +
      'unconditionally.',
  })
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string | null;
}
