import { ApiProperty } from '@nestjs/swagger';
import type { CourseDictionaryEntry } from '../../../domain/repositories/course-dictionary.reader.interface.js';

export class CourseDictionaryEntryResponseDto {
  @ApiProperty({
    description: "`vocabulary_items.id`. Becomes the row's `dictId`. Seeded words are uuidv5.",
    example: '5d4b1c2e-8f3a-5b7c-9d1e-2f3a4b5c6d7e',
  })
  id!: string;

  @ApiProperty({ example: 'bok', description: 'As stored: no article, no infinitive mark.' })
  word!: string;

  @ApiProperty({ example: 'NOUN', description: '`PartOfSpeech` enum name; empty when not set.' })
  pos!: string;

  @ApiProperty({
    example: 'book',
    description: 'Meaning in the requested language, else English, else any.',
  })
  gloss!: string;

  @ApiProperty({
    example: 'Nivå B1 · Leksjon 9',
    description: 'Where the word is introduced: the module, behind its course section if any.',
  })
  unit!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      gender: 'feminine',
      definite_singular: 'boka',
      plural_form: 'bøker',
      definite_plural: 'bøkene',
    },
    description: '`grammaticalProperties` as stored. The kernel spells the row from them.',
  })
  properties!: Record<string, unknown>;

  static from(entry: CourseDictionaryEntry): CourseDictionaryEntryResponseDto {
    return Object.assign(new CourseDictionaryEntryResponseDto(), entry);
  }
}
