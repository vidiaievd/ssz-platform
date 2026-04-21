import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, MinLength, MaxLength, IsBoolean } from 'class-validator';

export class UpdateSchoolRequestDto {
  @ApiPropertyOptional({ example: 'New School Name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/new-avatar.png' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'If true, tutors must review student self-paced exercises before they are marked complete',
  })
  @IsOptional()
  @IsBoolean()
  requireTutorReviewForSelfPaced?: boolean;

  @ApiPropertyOptional({
    example: 'uk',
    description: 'Default language for exercise explanations (ISO 639-1 code). Null to use student locale.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultExplanationLanguage?: string | null;
}
