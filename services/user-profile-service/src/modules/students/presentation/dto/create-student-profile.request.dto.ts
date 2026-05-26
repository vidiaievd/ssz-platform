import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { CefrLevel } from '../../domain/value-objects/target-language.vo.js';

export class TargetLanguageDto {
  @ApiProperty({ description: 'ISO 639-1 language code', example: 'nb' })
  @IsString()
  @Length(2, 5)
  code: string;

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

export class CreateStudentProfileRequestDto {
  @ApiProperty({
    description: 'ISO 639-1 native language code',
    example: 'uk',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(2, 5)
  nativeLanguage?: string;

  @ApiProperty({
    description: 'Target languages with optional CEFR level (max 10)',
    type: [TargetLanguageDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(10)
  @Type(() => TargetLanguageDto)
  targetLanguages?: TargetLanguageDto[];
}
