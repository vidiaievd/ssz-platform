import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { LanguageLevel } from '@prisma/client';

export class AddTargetLanguageDto {
  @ApiProperty({ example: 'no', description: 'ISO 639-1 language code' })
  @IsString()
  @Length(2, 10)
  languageCode: string;

  @ApiProperty({ enum: LanguageLevel, example: LanguageLevel.A1 })
  @IsEnum(LanguageLevel)
  currentLevel: LanguageLevel;

  @ApiPropertyOptional({ enum: LanguageLevel, example: LanguageLevel.B2 })
  @IsEnum(LanguageLevel)
  targetLevel?: LanguageLevel;
}
