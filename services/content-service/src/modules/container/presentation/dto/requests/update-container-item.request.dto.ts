import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';

export class UpdateContainerItemRequestDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({
    example: 'uuid-of-section',
    description: 'Section to attach this item to; pass null to ungroup',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @ApiPropertyOptional({
    example: 'Introduction',
    description: 'Deprecated free-text fallback — prefer sectionId',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sectionLabel?: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'XP awarded to the student on completion; pass null to clear',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  xpReward?: number | null;
}
