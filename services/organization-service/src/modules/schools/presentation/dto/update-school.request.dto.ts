import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsEmail,
  MinLength,
  MaxLength,
  IsBoolean,
  Matches,
} from 'class-validator';

export class UpdateSchoolRequestDto {
  @ApiPropertyOptional({ example: 'New School Name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'new-school-name',
    description: 'URL slug (3–60 chars, a-z0-9 and hyphens). Changing it breaks old links — warn the user.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens only',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/new-avatar.png' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'https://new-school.ua' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'info@new-school.ua' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'Lviv' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

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
