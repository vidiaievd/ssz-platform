import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class SetProsodyRequestDto {
  @ApiProperty({
    description:
      "The whole text with its marks (plan 86, §4a): `'1` / `'2` before the stressed syllable, " +
      "a bare `'` before a stressed monosyllable, `^` phrase accent; `/` `\\` `~` group end " +
      '(rise, fall, level), `|` `||` pause and `_` linking as words of their own. Without its ' +
      'marks it must equal the current text character for character. The text alone clears the layer.',
    example: "Jeg '1heter ^'1Anna \\ | og jeg '2snakker _ litt 'norsk \\ ||",
  })
  @IsString()
  @MaxLength(200_000)
  notation!: string;
}
