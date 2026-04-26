import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { VALID_CONTENT_TYPES } from '../../../../shared/domain/value-objects/content-ref.js';

export class CreateAssignmentRequest {
  @ApiProperty({ description: 'ID of the student being assigned content', format: 'uuid' })
  @IsUUID()
  assigneeId!: string;

  @ApiProperty({ description: 'School context for the assignment', format: 'uuid' })
  @IsUUID()
  schoolId!: string;

  @ApiProperty({ enum: VALID_CONTENT_TYPES, description: 'Type of content being assigned' })
  @IsIn(VALID_CONTENT_TYPES)
  contentType!: string;

  @ApiProperty({ description: 'ID of the content item', format: 'uuid' })
  @IsUUID()
  contentId!: string;

  @ApiProperty({ description: 'Assignment due date (ISO 8601)', example: '2026-06-01T12:00:00Z' })
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional({ description: 'Optional notes for the student' })
  @IsOptional()
  @IsString()
  notes?: string;
}
