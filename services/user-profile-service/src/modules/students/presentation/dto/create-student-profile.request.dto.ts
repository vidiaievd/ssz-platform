import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

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
}
