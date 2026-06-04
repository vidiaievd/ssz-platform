import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StudentDetailGroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() lang?: string | null;
  @ApiPropertyOptional() level?: string | null;
  @ApiPropertyOptional() courseId?: string | null;
}

export class StudentDetailResponseDto {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['active', 'at-risk', 'new', 'finished', 'unassigned'] }) status!: string;
  @ApiProperty() progress!: number;
  @ApiPropertyOptional() lastSeen?: string | null;
  @ApiProperty() enrolledAt!: string;
  @ApiPropertyOptional() completedAt?: string | null;
  @ApiProperty({ type: [StudentDetailGroupDto] }) groups!: StudentDetailGroupDto[];
}
