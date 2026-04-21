import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';

export class AddContainerItemRequestDto {
  @ApiProperty({ example: 'lesson', enum: ContainerItemType })
  @IsEnum(ContainerItemType)
  itemType: ContainerItemType;

  @ApiProperty({ example: 'uuid-of-referenced-item' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ example: 'Introduction' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sectionLabel?: string;
}
