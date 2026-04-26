import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ProgressDto, AssignmentProgressDto } from '../../application/dto/progress.dto.js';

class ContentRefResponse {
  @ApiProperty() type!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class ProgressResponse implements ProgressDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: ContentRefResponse }) contentRef!: { type: string; id: string };
  @ApiProperty({ enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW'] }) status!: string;
  @ApiProperty() attemptsCount!: number;
  @ApiPropertyOptional({ format: 'date-time' }) lastAttemptAt!: string | null;
  @ApiProperty() timeSpentSeconds!: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) score!: number | null;
  @ApiPropertyOptional({ format: 'date-time' }) completedAt!: string | null;
  @ApiPropertyOptional({ format: 'date-time' }) needsReviewSince!: string | null;
  @ApiPropertyOptional({ format: 'date-time' }) reviewResolvedAt!: string | null;
}

export class AssignmentProgressResponse implements AssignmentProgressDto {
  @ApiProperty({ format: 'uuid' }) assignmentId!: string;
  @ApiProperty({ format: 'uuid' }) assigneeId!: string;
  @ApiProperty({ type: ContentRefResponse }) contentRef!: { type: string; id: string };
  @ApiPropertyOptional({ type: ProgressResponse, nullable: true }) progress!: ProgressDto | null;
}
