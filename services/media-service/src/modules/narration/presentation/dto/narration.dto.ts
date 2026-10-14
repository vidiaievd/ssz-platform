import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  LENGTH_SCALE_RANGE,
  NARRATION_LEVELS,
  PAUSE_SCALE_RANGE,
} from '../../domain/narration-style.js';

export class RequestNarrationDto {
  @ApiProperty({
    example: '## 2D — Prøvetiden\n\n**Silje:** Hvordan synes du de første ukene har vært?',
    description:
      'Lesson body markdown. Media tokens, markup and speaker names are not read; the spoken ' +
      'script is limited to NARRATION_MAX_CHARS characters (12 000 by default).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60_000)
  bodyMarkdown!: string;

  @ApiPropertyOptional({ example: 'nb', description: 'BCP-47 language tag of the text. Defaults to Norwegian Bokmål.' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  lang?: string;

  @ApiPropertyOptional({ example: 'Les teksten', description: 'Shown in the asset list; becomes the file name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
    description: 'Lesson the narration is for; stored on the asset as its entity id',
  })
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @ApiPropertyOptional({
    example: 'B1',
    enum: NARRATION_LEVELS,
    description: "The course's CEFR level; picks the default pace (a beginner is read to more slowly)",
  })
  @IsOptional()
  @IsIn(NARRATION_LEVELS)
  level?: string;

  @ApiPropertyOptional({
    example: 1.7,
    minimum: LENGTH_SCALE_RANGE.min,
    maximum: LENGTH_SCALE_RANGE.max,
    description: "Phoneme length multiplier; above 1 is slower. Omitted: the level's default",
  })
  @IsOptional()
  @IsNumber()
  @Min(LENGTH_SCALE_RANGE.min)
  @Max(LENGTH_SCALE_RANGE.max)
  lengthScale?: number;

  @ApiPropertyOptional({
    example: 1,
    minimum: PAUSE_SCALE_RANGE.min,
    maximum: PAUSE_SCALE_RANGE.max,
    description: 'Multiplier on the pauses between paragraphs and turns. Omitted: 1',
  })
  @IsOptional()
  @IsNumber()
  @Min(PAUSE_SCALE_RANGE.min)
  @Max(PAUSE_SCALE_RANGE.max)
  pauseScale?: number;

  @ApiPropertyOptional({
    example: 'nvcc-kon',
    description: "The narrator's catalog id (see GET /media/narration/defaults). Omitted: the language's default voice",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  voiceId?: string;

  @ApiPropertyOptional({
    example: { Erik: 'nvcc-mmn', Taras: 'nvcc-mnn' },
    description:
      'Voice per speaker of the dialogue, by catalog id. Speakers left out are given voices of ' +
      'their own (never the narrator\'s); an id the language has no voice for is ignored.',
  })
  @IsOptional()
  @IsObject()
  speakerVoices?: Record<string, string>;
}

export class NarrationVoiceDto {
  @ApiProperty({ example: 'nvcc-kon', description: 'Pass as `voiceId` to narrate with this voice' })
  id!: string;

  @ApiProperty({ example: 'KON' })
  name!: string;

  @ApiProperty({ enum: ['female', 'male'], example: 'female' })
  gender!: string;

  @ApiProperty({ description: 'The voice a narration gets when no voice is chosen' })
  isDefault!: boolean;
}

export class NarrationStyleDto {
  @ApiProperty({ example: 1.7 })
  lengthScale!: number;

  @ApiProperty({ example: 1 })
  pauseScale!: number;
}

export class NarrationDefaultsResponseDto {
  @ApiProperty({ type: NarrationStyleDto, description: 'For a course whose level is not a CEFR one' })
  fallback!: NarrationStyleDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/NarrationStyleDto' },
    example: { A1: { lengthScale: 2, pauseScale: 1 }, B1: { lengthScale: 1.7, pauseScale: 1 } },
    description: 'The default pace and pauses of each CEFR level',
  })
  byLevel!: Record<string, NarrationStyleDto>;

  @ApiProperty({ type: [NarrationVoiceDto], description: 'The voices offered for the language, the default first' })
  voices!: NarrationVoiceDto[];

  @ApiProperty({ example: { lengthScale: 1, pauseScale: 0.5 }, description: 'The lowest value of each setting' })
  min!: NarrationStyleDto;

  @ApiProperty({ example: { lengthScale: 2.5, pauseScale: 2 }, description: 'The highest value of each setting' })
  max!: NarrationStyleDto;
}

export class RequestNarrationResponseDto {
  @ApiProperty({ description: 'The narration asset; poll GET /media/assets/:id until READY or FAILED' })
  assetId!: string;

  @ApiProperty({
    example: 'PENDING_UPLOAD',
    description: 'PENDING_UPLOAD while speaking, then UPLOADED → PROCESSING → READY like an upload',
  })
  status!: string;

  @ApiProperty({ example: 'no_NO-talesyntese-medium', description: "The narrator's voice" })
  voice!: string;

  @ApiProperty({ description: 'narrationTextHash of the spoken script; stored as synthesis.textHash' })
  textHash!: string;

  @ApiProperty({ example: 1.7, description: 'The pace it is spoken with: chosen, or the level default' })
  lengthScale!: number;

  @ApiProperty({ example: 1, description: 'The pause multiplier it is spoken with' })
  pauseScale!: number;

  @ApiProperty({ example: 21, description: 'Script segments: headings, paragraphs and dialogue turns' })
  segments!: number;

  @ApiProperty({ example: 2137, description: 'Spoken characters, the number NARRATION_MAX_CHARS limits' })
  characters!: number;

  @ApiProperty({
    example: { Erik: 'nvcc-mmn', Taras: 'nvcc-kon' },
    description: 'The voice each speaker speaks with — the author\'s choice, the rest assigned',
  })
  speakerVoices!: Record<string, string>;
}

/** The same request, made on an author's behalf by content-service (the batch narration). */
export class InternalRequestNarrationDto extends RequestNarrationDto {
  @ApiProperty({
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
    description: 'Who owns the narration asset — the lesson\'s owner, as if they had asked themselves',
  })
  @IsUUID('all')
  ownerId!: string;
}
