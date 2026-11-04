import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ProsodyIssue, ProsodyLayer, WordSounds } from '@ssz/shared-kernel/prosody';
import type { ProsodyAuthoringView } from '../../application/authoring-text.js';
import type { LessonProsodyView } from '../../application/queries/get-lesson-prosody/get-lesson-prosody.handler.js';
import type { ExerciseProsodyView } from '../../application/queries/get-exercise-prosody/get-exercise-prosody.handler.js';

const LAYER_DESCRIPTION =
  'A `ProsodyLayer` of `@ssz/shared-kernel/prosody`: `tokenizer`, `stresses`, `accents`, ' +
  '`boundaries`, `links`, `orphans`. Every mark is anchored by `i` (token index of ' +
  '`tokenize`, `unicode-word-v1`, over `text`) and `w` (the word as written).';

const SOUNDS_DESCRIPTION =
  'Plan 86, step 6d: the lexicon\'s letters-over-sounds of the words, a `WordSounds` each (`i`, `w`, `segs`; ' +
  '`SoundSeg` of `@ssz/shared-kernel/prosody`), anchored like the layer. Derived, never authored; a word ' +
  'the lexicon does not know or cannot be laid has none. Empty when ai-service does not answer.';

const LAYER_EXAMPLE = {
  tokenizer: 'unicode-word-v1',
  stresses: [{ i: 1, w: 'heter', toneme: 1, vowel: { s: 1, e: 2, long: true }, source: 'teacher' }],
  accents: [{ i: 2, w: 'Anna', source: 'teacher' }],
  boundaries: [{ i: 2, w: 'Anna', pitch: 'fall', pause: 'short', source: 'teacher' }],
  links: [],
  orphans: [],
};

export class ProsodyParagraphResponseDto {
  @ApiProperty({ example: 0 })
  paragraphIndex!: number;

  @ApiProperty({ example: 'Jeg heter Anna, og jeg snakker litt norsk.' })
  text!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: LAYER_DESCRIPTION,
    example: LAYER_EXAMPLE,
  })
  layer!: ProsodyLayer;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: SOUNDS_DESCRIPTION,
  })
  sounds!: WordSounds[];
}

export class LessonProsodyResponseDto {
  @ApiProperty({ type: [ProsodyParagraphResponseDto] })
  paragraphs!: ProsodyParagraphResponseDto[];

  static from(view: LessonProsodyView): LessonProsodyResponseDto {
    return Object.assign(new LessonProsodyResponseDto(), view);
  }
}

export class ProsodyPromptResponseDto {
  @ApiProperty({ example: 'p1' })
  promptId!: string;

  @ApiProperty({ example: 'Jeg heter Anna, og jeg snakker litt norsk.' })
  text!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: LAYER_DESCRIPTION,
    example: LAYER_EXAMPLE,
  })
  layer!: ProsodyLayer;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: SOUNDS_DESCRIPTION,
  })
  sounds!: WordSounds[];
}

export class ExerciseProsodyResponseDto {
  @ApiProperty({
    type: [ProsodyPromptResponseDto],
    description: 'Passages of a `read`-mode exercise; empty in the other modes.',
  })
  prompts!: ProsodyPromptResponseDto[];

  static from(view: ExerciseProsodyView): ExerciseProsodyResponseDto {
    return Object.assign(new ExerciseProsodyResponseDto(), view);
  }
}

export class ProsodyAuthoringResponseDto {
  @ApiProperty({ description: 'The text the layer is anchored to.' })
  text!: string;

  @ApiProperty({
    description: 'The stored layer written out; orphans and vowel length are not in it.',
    example: "Jeg '1heter ^'1Anna \\ | og jeg '2snakker _ litt 'norsk \\ ||",
  })
  notation!: string;

  @ApiProperty({ description: 'Marks the notation could not place.', example: 0 })
  dropped!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: `${LAYER_DESCRIPTION} Orphans — marks whose words an edit removed — included.`,
    example: LAYER_EXAMPLE,
  })
  layer!: ProsodyLayer;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: '`prosodyIssues` codes (`PR_…`) with their level and place.',
  })
  issues!: ProsodyIssue[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;

  static from(view: ProsodyAuthoringView): ProsodyAuthoringResponseDto {
    return Object.assign(new ProsodyAuthoringResponseDto(), {
      ...view,
      updatedAt: view.updatedAt?.toISOString() ?? null,
    });
  }
}
