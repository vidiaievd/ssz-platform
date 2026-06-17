import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MembershipScheduleSlotResponseDto {
  @ApiProperty()
  day: string;

  @ApiProperty()
  time: string;

  @ApiProperty()
  durationMin: number;
}

export class MembershipTeacherResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ enum: ['primary', 'co_primary', 'substitute'] })
  role: string;
}

export class StudentMembershipResponseDto {
  @ApiProperty({ description: 'Membership row id (not groupId)' })
  id: string;

  @ApiProperty()
  groupId: string;

  @ApiProperty()
  groupName: string;

  @ApiPropertyOptional({ nullable: true })
  lang: string | null;

  @ApiPropertyOptional({ nullable: true })
  level: string | null;

  @ApiProperty({ enum: ['student', 'trial', 'observer'] })
  role: string;

  @ApiProperty({ enum: ['active', 'past'] })
  status: string;

  @ApiProperty()
  addedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  exitedAt: Date | null;

  @ApiProperty({ type: [MembershipTeacherResponseDto] })
  teachers: MembershipTeacherResponseDto[];

  @ApiProperty({ type: [MembershipScheduleSlotResponseDto] })
  schedule: MembershipScheduleSlotResponseDto[];

  @ApiProperty({ enum: ['draft', 'active', 'archived'] })
  groupStatus: string;
}
