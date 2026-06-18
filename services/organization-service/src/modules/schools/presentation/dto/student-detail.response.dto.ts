import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StudentDetailGroupTeacherResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: ['primary', 'co_primary', 'substitute'] })
  role!: string;
}

export class StudentDetailGroupResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  lang!: string | null;

  @ApiPropertyOptional({ nullable: true })
  level!: string | null;

  @ApiPropertyOptional({ nullable: true })
  scheduleSummary?: string;

  @ApiProperty({ type: [StudentDetailGroupTeacherResponseDto] })
  teachers!: StudentDetailGroupTeacherResponseDto[];
}

export class StudentDetailResponseDto {
  @ApiProperty({ description: 'User UUID' })
  userId!: string;

  @ApiProperty({ description: 'Display name from profile-service (userId fallback)' })
  name!: string;

  @ApiPropertyOptional({ description: 'Email from profile-service', nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ description: 'Avatar URL from profile-service', nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ description: 'Primary language, derived from active groups', nullable: true })
  lang!: string | null;

  @ApiPropertyOptional({ description: 'Current CEFR level (A1-C2)', nullable: true })
  level!: string | null;

  @ApiProperty({ description: 'Member status', enum: ['active', 'invited', 'inactive', 'suspended'] })
  status!: string;

  @ApiPropertyOptional({ description: 'Study progress (0..1); not yet tracked', nullable: true })
  progress!: number | null;

  @ApiPropertyOptional({ description: 'Last activity timestamp (ISO 8601); not yet tracked', nullable: true })
  lastSeen!: string | null;

  @ApiProperty({ description: 'Join timestamp (ISO 8601)' })
  enrolledAt!: string;

  @ApiProperty({ type: [StudentDetailGroupResponseDto], description: 'Active group memberships' })
  groups!: StudentDetailGroupResponseDto[];
}
