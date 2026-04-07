import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsString, Length } from 'class-validator';
import { LanguageLevel, TutorProficiency } from '@prisma/client';

export class AddTutorLanguageDto {
  @ApiProperty({ example: 'no', description: 'ISO 639-1 language code' })
  @IsString()
  @Length(2, 10)
  languageCode: string;

  @ApiProperty({ enum: TutorProficiency, example: TutorProficiency.NATIVE })
  @IsEnum(TutorProficiency)
  proficiency: TutorProficiency;

  @ApiProperty({
    example: ['A1', 'A2', 'B1'],
    description: 'Levels this tutor is willing to teach',
    isArray: true,
    enum: LanguageLevel,
  })
  @IsArray()
  @IsEnum(LanguageLevel, { each: true })
  teachesLevels: string[];
}
