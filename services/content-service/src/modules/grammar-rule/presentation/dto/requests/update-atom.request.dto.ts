import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';

export class UpdateAtomRequestDto {
  @ApiPropertyOptional({
    description:
      "New slug. Safe for a learner's memory — cards and exercise targets address the atom " +
      'by id, not by this — but a seed or an import keyed on the old value will create a ' +
      'second atom instead of updating this one.',
    example: 'definite-plural',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/, {
    message: 'key must be kebab-case (letters, digits and single hyphens)',
  })
  key?: string;

  @ApiPropertyOptional({ example: 'Definite plural (-ene)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Send an empty string to clear the note.',
    example: 'husene, bøkene.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: AtomTrack, example: AtomTrack.GRAMMAR })
  @IsOptional()
  @IsEnum(AtomTrack)
  track?: AtomTrack;
}
