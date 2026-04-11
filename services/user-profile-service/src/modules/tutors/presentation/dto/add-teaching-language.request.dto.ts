import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { Proficiency } from '../../domain/value-objects/teaching-language.vo.js';

export class AddTeachingLanguageRequestDto {
  @ApiProperty({ description: 'ISO 639-1 language code', example: 'en' })
  @IsString()
  @Length(2, 5)
  languageCode!: string;

  @ApiProperty({
    description: 'Proficiency level',
    enum: Proficiency,
    example: Proficiency.FLUENT,
  })
  @IsEnum(Proficiency)
  proficiency!: Proficiency;
}
