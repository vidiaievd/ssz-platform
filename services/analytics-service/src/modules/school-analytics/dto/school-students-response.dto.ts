import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StudentGroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() lang?: string | null;
  @ApiPropertyOptional() level?: string | null;
}

export class SchoolStudentDto {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['active', 'at-risk', 'new', 'finished', 'unassigned'] }) status!: string;
  @ApiProperty({ type: [StudentGroupDto] }) groups!: StudentGroupDto[];
  @ApiProperty() progress!: number;
  @ApiPropertyOptional() lastSeen?: string | null;
  @ApiProperty() enrolledAt!: string;
}

export class SchoolStudentsResponseDto {
  @ApiProperty({ type: [SchoolStudentDto] }) items!: SchoolStudentDto[];
  @ApiProperty() total!: number;
  @ApiPropertyOptional() nextCursor?: string | null;
}
