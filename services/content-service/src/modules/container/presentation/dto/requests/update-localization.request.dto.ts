import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLocalizationRequestDto {
  @ApiPropertyOptional({ example: 'Norsk for nybegynnere' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'Et kurs for absolutte nybegynnere.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
