import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AddTargetLanguageRequestDto {
  @ApiProperty({
    description: 'ISO 639-1 target language code',
    example: 'en',
  })
  @IsString()
  @Length(2, 5)
  languageCode!: string;
}
