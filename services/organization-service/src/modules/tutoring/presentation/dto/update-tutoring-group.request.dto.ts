import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateTutoringGroupRequestDto {
  @ApiPropertyOptional({ example: 'Advanced Group' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'C1 level English' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/new-avatar.png' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
