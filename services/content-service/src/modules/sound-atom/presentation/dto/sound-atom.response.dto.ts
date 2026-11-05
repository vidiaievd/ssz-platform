import { ApiProperty } from '@nestjs/swagger';
import type { SoundAtomCatalogEntry } from '../../../internal/application/queries/sound-atom-catalog/sound-atom-catalog.handler.js';

/** A sound as the learner's card shows it (plan 86, step 9.2). */
export class SoundAtomResponseDto {
  @ApiProperty({
    example: 'nb:kj',
    description: 'Natural key `<language>:<family>`, as remarks name it',
  })
  atomId!: string;

  @ApiProperty({ example: 'kj' })
  family!: string;

  @ApiProperty({
    example: 'ç',
    description: 'IPA of the sound (several, comma-separated, for a family)',
  })
  ipa!: string;

  @ApiProperty({
    description:
      'ai-service measures this sound and may flag it; otherwise only the course teaches it',
  })
  scored!: boolean;

  @ApiProperty({
    example: 'uk',
    description: 'The locale of the texts: the asked one, or `en` when it has none',
  })
  locale!: string;

  @ApiProperty({ example: 'Звук kj [ç]' })
  title!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'What the sound is and how it is spelled',
  })
  description!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'How to say it: tongue, lips, voice, length',
  })
  howTo!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The usual mistake of speakers of Russian and Ukrainian (written for them in every locale)',
  })
  commonError!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Where Ukrainian speakers differ; null — they do not',
  })
  ukNote!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'A short exercise to find the sound' })
  drill!: string | null;

  @ApiProperty({
    type: [String],
    example: ['kjøkken', 'kino', 'kirke'],
    description: 'Common words holding the sound; pairs for `vowel_length` and `tone`',
  })
  carrierWords!: string[];

  static from(entry: SoundAtomCatalogEntry): SoundAtomResponseDto {
    return Object.assign(new SoundAtomResponseDto(), entry);
  }
}
