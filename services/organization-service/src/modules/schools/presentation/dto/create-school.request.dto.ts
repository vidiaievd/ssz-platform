import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsEmail,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { SchoolType } from '../../domain/value-objects/school-type.vo.js';

export class CreateSchoolRequestDto {
  @ApiProperty({ example: 'Sunrise Language School', description: 'Unique school name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 'sunrise-language-school',
    description: 'URL slug (3–60 chars, a-z0-9 and hyphens). Auto-generated from name if omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens only',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'A premier language school in Kyiv' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/school-avatar.png' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'https://sunrise-school.ua' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ example: 'contact@sunrise-school.ua' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'Kyiv' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ enum: SchoolType, default: SchoolType.ONLINE, description: 'ONLINE (default) or HYBRID (has physical sessions)' })
  @IsOptional()
  @IsEnum(SchoolType)
  type?: SchoolType;
}
