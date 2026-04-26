import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AssignmentDto } from '../../application/dto/assignment.dto.js';

class ContentRefResponse {
  @ApiProperty({ enum: ['CONTAINER', 'LESSON', 'VOCABULARY_LIST', 'GRAMMAR_RULE', 'EXERCISE'] })
  type!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class AssignmentResponse implements AssignmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  assignerId!: string;

  @ApiProperty({ format: 'uuid' })
  assigneeId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  schoolId!: string | null;

  @ApiProperty({ type: ContentRefResponse })
  contentRef!: { type: string; id: string };

  @ApiProperty({ enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE'] })
  status!: string;

  @ApiProperty()
  assignedAt!: string;

  @ApiProperty()
  dueAt!: string;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}
