import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLocalizationRequestDto {
  @ApiProperty({ example: 'no' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  languageCode: string;

  @ApiProperty({ example: 'Norsk for nybegynnere' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Et kurs for absolutte nybegynnere.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
