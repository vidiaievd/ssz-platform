import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import {
  DICTIONARY_PARTS_OF_SPEECH,
  type DictionaryPartOfSpeech,
} from '../../../domain/repositories/course-dictionary.reader.interface.js';

export class CourseDictionaryRequestDto {
  @ApiPropertyOptional({
    enum: DICTIONARY_PARTS_OF_SPEECH,
    example: 'NOUN',
    description: "The paradigm's part of speech. Omitted, every word of the course is returned.",
  })
  @IsOptional()
  @IsIn(DICTIONARY_PARTS_OF_SPEECH)
  pos?: DictionaryPartOfSpeech;

  @ApiPropertyOptional({
    example: 'uk',
    description:
      "The author's interface language, for the gloss. Falls back to English, then to any.",
  })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  lang?: string;
}
