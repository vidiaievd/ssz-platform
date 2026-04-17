import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpsertItemTranslationRequestDto {
  @ApiProperty({ example: 'hello', description: 'Primary translation of the word' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  primaryTranslation: string;

  @ApiPropertyOptional({ example: ['hi', 'hey'], description: 'Alternative translations' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alternativeTranslations?: string[];

  @ApiPropertyOptional({
    example: 'A casual greeting used in English-speaking countries.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.definition !== null)
  @IsString()
  @MaxLength(2000)
  definition?: string | null;

  @ApiPropertyOptional({ example: 'Used in informal speech.', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.usageNotes !== null)
  @IsString()
  @MaxLength(1000)
  usageNotes?: string | null;

  @ApiPropertyOptional({
    example: 'Not the same as "goodbye".',
    description: 'Warning about a false cognate or false friend.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.falseFriendWarning !== null)
  @IsString()
  @MaxLength(500)
  falseFriendWarning?: string | null;
}
