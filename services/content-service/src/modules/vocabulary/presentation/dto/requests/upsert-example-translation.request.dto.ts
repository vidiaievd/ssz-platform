import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpsertExampleTranslationRequestDto {
  @ApiProperty({ example: 'Hi, how are you?', description: 'The translated example sentence' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  translatedText: string;
}
