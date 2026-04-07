import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddQualificationDto {
  @ApiProperty({ example: 'CELTA', description: 'Certificate or degree name' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Cambridge Assessment English' })
  @IsString()
  @MaxLength(200)
  institution: string;

  @ApiProperty({ example: 2019, description: 'Year of issue' })
  @IsInt()
  @Min(1950)
  @Max(new Date().getFullYear())
  @Type(() => Number)
  year: number;

  @ApiPropertyOptional({ example: 'https://storage.example.com/cert.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentUrl?: string;
}
