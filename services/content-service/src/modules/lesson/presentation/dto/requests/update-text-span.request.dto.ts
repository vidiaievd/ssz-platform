import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

/**
 * Re-anchoring and note edits. `kind` and `refId` are absent by design: pointing
 * an annotation at a different referent is a delete plus a create, which keeps
 * the glossary-mark sync on the create path only.
 *
 * The three anchor fields move together — a partial anchor would silently mix
 * old and new coordinates.
 */
export class UpdateTextSpanRequestDto {
  @ApiPropertyOptional({ example: 3, description: 'Required together with charStart and charEnd' })
  @ValidateIf(
    (dto: UpdateTextSpanRequestDto) => dto.charStart !== undefined || dto.charEnd !== undefined,
  )
  @IsInt()
  @Min(0)
  paragraphIndex?: number;

  @ApiPropertyOptional({ example: 12 })
  @ValidateIf(
    (dto: UpdateTextSpanRequestDto) =>
      dto.paragraphIndex !== undefined || dto.charEnd !== undefined,
  )
  @IsInt()
  @Min(0)
  charStart?: number;

  @ApiPropertyOptional({ example: 24 })
  @ValidateIf(
    (dto: UpdateTextSpanRequestDto) =>
      dto.paragraphIndex !== undefined || dto.charStart !== undefined,
  )
  @IsInt()
  @Min(1)
  charEnd?: number;

  @ApiPropertyOptional({ example: 'Fast uttrykk', description: 'Null clears the note' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
