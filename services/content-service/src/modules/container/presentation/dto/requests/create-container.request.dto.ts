import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';

export class CreateContainerRequestDto {
  @ApiProperty({ example: 'course', enum: ContainerType })
  @IsEnum(ContainerType)
  containerType: ContainerType;

  @ApiProperty({ example: 'no' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  targetLanguage: string;

  @ApiProperty({ example: 'A1', enum: DifficultyLevel })
  @IsEnum(DifficultyLevel)
  difficultyLevel: DifficultyLevel;

  @ApiProperty({ example: 'Norwegian for Beginners' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'A comprehensive course for absolute beginners.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'uuid-of-cover-image' })
  @IsOptional()
  @IsUUID()
  coverImageMediaId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-owner-school' })
  @IsOptional()
  @IsUUID()
  ownerSchoolId?: string;

  @ApiProperty({ example: 'public', enum: Visibility })
  @IsEnum(Visibility)
  visibility: Visibility;

  @ApiProperty({ example: 'public_free', enum: AccessTier })
  @IsEnum(AccessTier)
  accessTier: AccessTier;
}
