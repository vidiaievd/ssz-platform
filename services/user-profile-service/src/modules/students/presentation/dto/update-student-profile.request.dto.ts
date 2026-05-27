import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateStudentProfileRequestDto {
  @ApiPropertyOptional({
    description: 'ISO 639-1 native language code',
    example: 'uk',
  })
  @IsOptional()
  @IsString()
  @Length(2, 5)
  nativeLanguage?: string;
}
