import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsPositive, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class RequestUploadDto {
  @ApiProperty({ example: 'image/jpeg', description: 'MIME type of the file to upload' })
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @ApiProperty({ example: 2097152, description: 'File size in bytes' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  sizeBytes!: number;

  @ApiPropertyOptional({ example: 'avatar.jpg', description: 'Original filename' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  originalFilename?: string;

  @ApiPropertyOptional({
    example: 'profile_avatar',
    description: 'Entity type this asset is attached to (e.g. profile_avatar, lesson_image)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @ApiPropertyOptional({ example: 'uuid-of-entity', description: 'ID of the entity this asset belongs to' })
  @IsOptional()
  @IsString()
  entityId?: string;
}
