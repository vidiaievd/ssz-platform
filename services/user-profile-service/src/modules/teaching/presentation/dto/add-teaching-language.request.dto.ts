import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Length, IsOptional, Matches } from 'class-validator';

export class AddTeachingLanguageRequestDto {
  @ApiProperty({ example: 'nb', description: 'ISO 639-1 language code' })
  @IsString()
  @Length(2, 2)
  code!: string;

  @ApiPropertyOptional({ example: 'C2', description: 'CEFR level: A1 | A2 | B1 | B2 | C1 | C2' })
  @IsOptional()
  @IsString()
  @Matches(/^(A1|A2|B1|B2|C1|C2)$/)
  level?: string;
}
