import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProfileType } from '../../domain/value-objects/profile-type.vo.js';

export class CreateProfileRequestDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: '[TEST ONLY] userId from Auth Service',
  })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'John Doe', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  displayName: string;

  @ApiProperty({ enum: ProfileType, example: ProfileType.STUDENT })
  @IsEnum(ProfileType)
  profileType: ProfileType;

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

  @ApiPropertyOptional({ example: 'Europe/Kyiv' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'uk' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}
