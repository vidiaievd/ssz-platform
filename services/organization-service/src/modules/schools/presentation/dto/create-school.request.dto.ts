import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, MinLength, MaxLength } from 'class-validator';

export class CreateSchoolRequestDto {
  @ApiProperty({ example: 'Sunrise Language School', description: 'Unique school name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'A premier language school in Kyiv' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/school-avatar.png' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
