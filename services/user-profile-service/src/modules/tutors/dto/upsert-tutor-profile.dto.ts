import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertTutorProfileDto {
  @ApiProperty({ example: 'Norwegian & English tutor with 5+ years of experience' })
  @IsString()
  @MaxLength(200)
  headline: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  yearsOfExperience: number;

  @ApiPropertyOptional({ example: 25.5, description: 'Hourly rate in specified currency' })
  @IsOptional()
  @Type(() => Number)
  hourlyRate?: number;

  @ApiPropertyOptional({ example: 'USD', description: '3-letter ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isAvailableForHire?: boolean;
}
