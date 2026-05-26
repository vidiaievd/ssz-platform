import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { CefrLevel } from '../../domain/value-objects/target-language.vo.js';

export class AddTargetLanguageRequestDto {
  @ApiProperty({
    description: 'ISO 639-1 target language code',
    example: 'en',
  })
  @IsString()
  @Length(2, 5)
  languageCode!: string;

  @ApiProperty({
    description: 'CEFR proficiency level',
    enum: Object.values(CefrLevel),
    example: CefrLevel.B1,
    required: false,
  })
  @IsOptional()
  @IsIn(Object.values(CefrLevel))
  level?: string;
}
