import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';

export class ParagraphTranslationEntryDto {
  @ApiProperty({ example: 0, minimum: 0, description: '0-based paragraph index within body_markdown' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paragraphIndex: number;

  @ApiProperty({ example: 'Hi, how are you?' })
  @IsString()
  @IsNotEmpty()
  translation: string;
}

export class SetParagraphTranslationsRequestDto {
  @ApiProperty({ type: [ParagraphTranslationEntryDto], description: 'Full replacement set' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParagraphTranslationEntryDto)
  translations: ParagraphTranslationEntryDto[];
}
