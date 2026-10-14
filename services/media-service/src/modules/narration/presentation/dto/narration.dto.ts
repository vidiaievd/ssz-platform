import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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

  @ApiProperty({ example: 21, description: 'Script segments: headings, paragraphs and dialogue turns' })
  segments!: number;

  @ApiProperty({ example: 2137, description: 'Spoken characters, the number NARRATION_MAX_CHARS limits' })
  characters!: number;
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
