import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class EnrollInContainerRequest {
  @ApiProperty({ description: 'ID of the container (course/module) to enroll in', format: 'uuid' })
  @IsUUID()
  containerId!: string;

  @ApiPropertyOptional({ description: 'School context for FREE_WITHIN_SCHOOL access tier', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}
