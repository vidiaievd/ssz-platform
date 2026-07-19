import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CompareExampleEntryDto {
  @ApiProperty({ example: 0, minimum: 0, description: '0-based ordinal within the explanation' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position: number;

  @ApiProperty({ example: 'Jeg spiser epler.' })
  @IsString()
  @IsNotEmpty()
  sentence: string;

  @ApiPropertyOptional({ example: 'Present tense, correct word order.' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isCorrect: boolean;
}

export class SetCompareExamplesRequestDto {
  @ApiProperty({ type: [CompareExampleEntryDto], description: 'Full replacement set' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompareExampleEntryDto)
  items: CompareExampleEntryDto[];
}
