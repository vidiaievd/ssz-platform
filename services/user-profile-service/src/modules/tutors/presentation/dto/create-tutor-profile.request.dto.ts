import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Proficiency } from '../../domain/value-objects/teaching-language.vo.js';

export class TeachingLanguageDto {
  @ApiProperty({ description: 'ISO 639-1 language code', example: 'en' })
  @IsString()
  @Length(2, 5)
  code: string;

  @ApiProperty({
    description: 'Proficiency level',
    enum: Object.values(Proficiency),
    example: Proficiency.FLUENT,
  })
  @IsIn(Object.values(Proficiency))
  proficiency: string;
}

export class CreateTutorProfileRequestDto {
  @ApiProperty({
    description: 'Hourly rate in USD',
    example: 25.0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiProperty({
    description: 'Years of teaching experience',
    example: 3,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;

  @ApiProperty({
    description: 'Languages the tutor teaches (max 10)',
    type: [TeachingLanguageDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(10)
  @Type(() => TeachingLanguageDto)
  teachingLanguages?: TeachingLanguageDto[];
}
