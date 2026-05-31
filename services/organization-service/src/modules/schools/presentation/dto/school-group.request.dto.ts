import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, IsOptional } from 'class-validator';

export class CreateSchoolGroupRequestDto {
  @ApiProperty({ example: 'Level A2 — Spring 2026' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Beginner group, morning sessions' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateSchoolGroupRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class AddGroupMemberRequestDto {
  @ApiProperty({ description: 'userId of an existing school member' })
  @IsString()
  userId!: string;
}
