import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, Length, MaxLength } from 'class-validator';

/** A text is at most a lesson body; the tagger takes 64 KiB, a longer one is only left untagged. */
export const MAX_TEXT_LENGTH = 100_000;
export const MAX_SPANS = 20_000;

export class WordStressesRequestDto {
  @ApiProperty({ example: 'nb', description: 'Course language; only `nb` has a lexicon, any other answers no words' })
  @IsString()
  @Length(2, 8)
  language!: string;

  @ApiProperty({ example: 'Jeg heter Anna.', description: 'The whole text, as the caller counted its words in it' })
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
    ],
    description:
      "The caller's words as `[start, end)` character offsets in `text` (content-service: the kernel's `tokenize`)",
  })
  @IsArray()
  @ArrayMaxSize(MAX_SPANS)
  spans!: unknown[];
}

export class StressedVowelDto {
  @ApiProperty({ example: 1, description: 'Offset of the vowel in the word' }) s!: number;
  @ApiProperty({ example: 2, description: 'One past its end; two letters for a diphthong' }) e!: number;
  @ApiProperty({ type: Boolean, nullable: true, description: 'Long vowel or diphthong; null where variants disagree' })
  long!: boolean | null;
}

export class WordStressDto {
  @ApiProperty({ example: 1, description: 'Index into the request’s `spans`' }) index!: number;
  @ApiProperty({ type: Number, nullable: true, enum: [1, 2], description: 'Null on a monosyllable' })
  toneme!: 1 | 2 | null;
  @ApiProperty({ type: StressedVowelDto }) vowel!: StressedVowelDto;
}

export class WordStressesResponseDto {
  @ApiProperty({
    type: [WordStressDto],
    description:
      'Only the words that get a mark: in the lexicon, not a function word, and every variant the context leaves ' +
      'agrees on the vowel and the toneme',
  })
  words!: WordStressDto[];
}
