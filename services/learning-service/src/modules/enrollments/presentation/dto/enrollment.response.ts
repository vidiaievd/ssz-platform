import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { EnrollmentDto } from '../../application/dto/enrollment.dto.js';

export class EnrollmentResponse implements EnrollmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  containerId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  schoolId!: string | null;

  @ApiProperty({ enum: ['ACTIVE', 'COMPLETED', 'UNENROLLED'] })
  status!: string;

  @ApiProperty()
  enrolledAt!: string;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  unenrolledAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  unenrollReason!: string | null;
}
