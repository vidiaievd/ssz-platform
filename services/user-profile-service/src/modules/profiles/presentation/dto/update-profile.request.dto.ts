import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class UpdateProfileRequestDto {
  @ApiPropertyOptional({ example: 'John Doe', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: 'John', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Language enthusiast learning Ukrainian.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: 'Europe/Kyiv' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'uk' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  uiLocale?: string;

  @ApiPropertyOptional({
    example: null,
    description: 'Guardian account ID (seam for minors — always null for current adults-only flow)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  guardianAccountId?: string;

  @ApiPropertyOptional({ example: '1995-06-15', description: 'Date of birth (ISO 8601 date)' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    example: ['uk', 'en'],
    description: 'Language codes the user wants to learn (ISO 639-1)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[a-z]{2}$/, { each: true, message: 'Each language code must be 2 lowercase letters' })
  languagesOfInterest?: string[];
}
