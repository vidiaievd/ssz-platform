import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SubmissionDto, SubmissionRevisionDto } from '../../application/dto/submission.dto.js';

export class SubmissionRevisionResponse implements SubmissionRevisionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() revisionNumber!: number;
  @ApiProperty({ description: '{ text?, mediaRefs? }' }) content!: { text?: string; mediaRefs?: string[] };
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
  @ApiPropertyOptional({ format: 'uuid' }) reviewedBy!: string | null;
  @ApiPropertyOptional({ format: 'date-time' }) reviewedAt!: string | null;
  @ApiPropertyOptional() feedback!: string | null;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) score!: number | null;
  @ApiPropertyOptional({ enum: ['APPROVED', 'REJECTED', 'REVISION_REQUESTED'] }) decision!: string | null;
}

export class SubmissionResponse implements SubmissionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ format: 'uuid' }) exerciseId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) assignmentId!: string | null;
  @ApiPropertyOptional({ format: 'uuid' }) schoolId!: string | null;
  @ApiProperty({ enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'RESUBMITTED'] }) status!: string;
  @ApiProperty() currentRevisionNumber!: number;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
  @ApiProperty({ type: [SubmissionRevisionResponse] }) revisions!: SubmissionRevisionDto[];
}
