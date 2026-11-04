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

export class SoundSegDto {
  @ApiProperty({ example: 2, description: 'Offset of the first letter in the word' }) s!: number;
  @ApiProperty({ example: 4, description: 'One past the last letter; equal to `s` for a sound the spelling does not write' })
  e!: number;
  @ApiProperty({ enum: ['vowel', 'consonant', 'silent'], description: 'Silent letters are written and not said' })
  kind!: 'vowel' | 'consonant' | 'silent';
  @ApiProperty({ type: [String], example: ['NG'], description: 'NoFAbet symbols heard here, no stress digits' })
  sounds!: string[];
  @ApiProperty({ type: Number, nullable: true, enum: [0, 1, 2, 3], description: 'Stress digit of a vowel or syllabic consonant' })
  stress!: 0 | 1 | 2 | 3 | null;
  @ApiProperty({ type: Boolean, nullable: true, description: 'Vowels only: long vowel or diphthong' })
  long!: boolean | null;
  @ApiProperty({ example: true, description: 'Several letters read as one sound (kj, sj, ng, rt)' }) tie!: boolean;
}

export class WordSoundsDto {
  @ApiProperty({ example: 1, description: 'Index into the request’s `spans`' }) index!: number;
  @ApiProperty({ type: [SoundSegDto], description: 'In order, with no gap over the letters of the word' })
  segs!: SoundSegDto[];
}

export class WordStressesResponseDto {
  @ApiProperty({
    type: [WordStressDto],
    description:
      'Only the words that get a mark: in the lexicon, not a function word, and every variant the context leaves ' +
      'agrees on the vowel and the toneme',
  })
  words!: WordStressDto[];

  @ApiProperty({
    type: [WordSoundsDto],
    description:
      'Only the words whose letters could be laid over their sounds: in the lexicon, every variant the context ' +
      'leaves aligning to the same segments. Function words are here — they have sounds, just no stress mark',
  })
  sounds!: WordSoundsDto[];

  @ApiProperty({
    type: [Number],
    example: [0],
    description:
      'Plan 86, step 6h.2: indices of the spans with letters that got no mark and are not function words — ' +
      'unknown to the lexicon (names), or homographs the context did not settle, or not placeable without a ' +
      'guess. An author with the pronunciation guide on settles each. Empty for a language with no lexicon ' +
      'and for a text none of whose words the lexicon knows',
  })
  unresolved!: number[];
}
