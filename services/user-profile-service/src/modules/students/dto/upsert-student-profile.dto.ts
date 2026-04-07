import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class UpsertStudentProfileDto {
  @ApiProperty({
    example: 'uk',
    description: 'ISO 639-1 native language code',
  })
  @IsString()
  @Length(2, 10)
  nativeLanguage: string;
}
