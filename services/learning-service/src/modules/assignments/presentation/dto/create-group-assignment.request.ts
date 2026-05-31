import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { VALID_CONTENT_TYPES } from '../../../../shared/domain/value-objects/content-ref.js';

export class CreateGroupAssignmentRequest {
  @ApiProperty({ description: 'School that contains the group', format: 'uuid' })
  @IsUUID()
  schoolId!: string;

  @ApiProperty({ description: 'Group to assign content to', format: 'uuid' })
  @IsUUID()
  groupId!: string;

  @ApiProperty({ enum: VALID_CONTENT_TYPES })
  @IsIn(VALID_CONTENT_TYPES)
  contentType!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contentId!: string;

  @ApiProperty({ description: 'Due date (ISO 8601)', example: '2026-06-15T12:00:00Z' })
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
