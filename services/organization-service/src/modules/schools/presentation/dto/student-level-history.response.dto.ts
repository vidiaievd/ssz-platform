import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LevelHistoryAssessorResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ['primary', 'co_primary', 'substitute'] })
  role: string | null;
}

export class StudentLevelHistoryEntryResponseDto {
  @ApiProperty()
  level: string;

  @ApiProperty()
  startedAt: Date;

  @ApiPropertyOptional({ nullable: true, description: 'null if this is the current level' })
  endedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  groupId: string | null;

  @ApiPropertyOptional({ nullable: true })
  groupName: string | null;

  @ApiPropertyOptional({ nullable: true, type: LevelHistoryAssessorResponseDto })
  assessedBy: LevelHistoryAssessorResponseDto | null;
}
