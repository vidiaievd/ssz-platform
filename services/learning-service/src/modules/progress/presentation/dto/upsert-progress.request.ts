import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { VALID_CONTENT_TYPES } from '../../../../shared/domain/value-objects/content-ref.js';

export class UpsertProgressRequest {
  @ApiProperty({ enum: VALID_CONTENT_TYPES })
  @IsIn(VALID_CONTENT_TYPES)
  contentType!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID(4)
  contentId!: string;

  @ApiProperty({ minimum: 0, description: 'Seconds spent in this session' })
  @IsInt()
  @Min(0)
  timeSpentSeconds!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;

  @ApiProperty()
  @IsBoolean()
  completed!: boolean;
}

export class FlagProgressRequest {
  @ApiProperty({ format: 'uuid', description: 'User whose progress to flag' })
  @IsUUID(4)
  targetUserId!: string;
}

export class ResolveProgressRequest {
  @ApiProperty({ format: 'uuid', description: 'User whose progress to resolve' })
  @IsUUID(4)
  targetUserId!: string;

  @ApiProperty({ description: 'true = approved (back to COMPLETED), false = rejected (back to IN_PROGRESS)' })
  @IsBoolean()
  approved!: boolean;
}
