import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';

export class CreateTextSpanRequestDto {
  @ApiProperty({
    example: 3,
    description:
      '0-based index into the blank-line split of body_markdown — the same numbering as paragraph translations',
  })
  @IsInt()
  @Min(0)
  paragraphIndex: number;

  @ApiProperty({
    example: 12,
    description: 'UTF-16 offset of the first annotated character within the paragraph',
  })
  @IsInt()
  @Min(0)
  charStart: number;

  @ApiProperty({
    example: 24,
    description: 'UTF-16 offset one past the last annotated character (exclusive)',
  })
  @IsInt()
  @Min(1)
  charEnd: number;

  @ApiProperty({ enum: LessonSpanKind, example: LessonSpanKind.VOCAB })
  @IsEnum(LessonSpanKind)
  kind: LessonSpanKind;

  @ApiPropertyOptional({
    example: 'uuid-of-vocabulary-item',
    description:
      'Vocabulary item id for kind=vocab, grammar rule id for kind=grammar; must be omitted for kind=chunk',
  })
  @ValidateIf((dto: CreateTextSpanRequestDto) => dto.kind !== LessonSpanKind.CHUNK)
  @IsUUID()
  refId?: string;

  @ApiPropertyOptional({
    example: 'Fast uttrykk — “på grunn av” styrer genitiv her',
    description: "Author's hint, shown in the reader's card. Mainly for chunks.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
