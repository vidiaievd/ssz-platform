import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';

export class CreateAtomRequestDto {
  @ApiProperty({
    description:
      'Stable address of the atom inside this rule. Lowercase kebab-case; cards and ' +
      'exercise targets are keyed by it, so it cannot be changed afterwards — re-cutting ' +
      'an atom means retiring this one and creating another.',
    example: 'definite-plural',
    maxLength: 60,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/, {
    message: 'key must be kebab-case (letters, digits and single hyphens)',
  })
  key!: string;

  @ApiProperty({
    description: 'What the author and the teacher read.',
    example: 'Definite plural (-ene)',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description: 'Optional note for the author — when this atom applies, what it contrasts with.',
    example: 'husene, bøkene. Contrast with the indefinite plural.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description:
      'Which SRS track the atom is scored on. `lexis` is correct for facts learnt one word ' +
      'at a time even when they live inside a grammar rule — the gender of a noun is the ' +
      'standard case.',
    enum: AtomTrack,
    example: AtomTrack.GRAMMAR,
  })
  @IsEnum(AtomTrack)
  track!: AtomTrack;
}
