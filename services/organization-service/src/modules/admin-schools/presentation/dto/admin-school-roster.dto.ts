import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import {
  ADMIN_MEMBER_ROLES,
  ADMIN_MEMBER_STATUSES,
  ADMIN_MEMBERS_PAGE_MAX,
  type AdminMemberRole,
  type AdminMemberStatus,
  type RosterRole,
} from '../../domain/admin-school-roster.js';

/** Any UUID version: seeded rows are uuidv5. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROSTER_ROLES: readonly RosterRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'CONTENT_ADMIN', 'TEACHER', 'STUDENT', 'SCHEDULER'];

export class ListAdminSchoolMembersQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_MEMBER_ROLES, description: '`staff` = every row that is neither student nor teacher' })
  @IsOptional()
  @IsIn(ADMIN_MEMBER_ROLES)
  role?: AdminMemberRole;

  @ApiPropertyOptional({ enum: ADMIN_MEMBER_STATUSES, description: '`archived` exists for students only' })
  @IsOptional()
  @IsIn(ADMIN_MEMBER_STATUSES)
  status?: AdminMemberStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Members in this group today (membership or a teaching assignment that has not ended)',
  })
  @IsOptional()
  @Matches(UUID, { message: 'groupId must be a UUID' })
  groupId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: ADMIN_MEMBERS_PAGE_MAX, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_MEMBERS_PAGE_MAX)
  limit?: number;
}

export class AdminMemberGroupDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'A2 kveld' }) name!: string;
  @ApiProperty({ description: "A SOLO workspace's hidden group that holds every learner" }) isDefault!: boolean;
  @ApiProperty({ enum: ['student', 'trial', 'observer', 'teacher'], description: '`teacher` = a teaching assignment' })
  as!: string;
}

export class AdminMemberDto {
  @ApiProperty() userId!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Synced from profile-service; null until the first sync — ask profiles then',
    example: 'Kari Nordmann',
  })
  name!: string | null;
  @ApiProperty({ enum: ADMIN_MEMBER_ROLES }) role!: AdminMemberRole;
  @ApiProperty({ enum: ROSTER_ROLES, description: 'The exact roster role, e.g. MANAGER inside staff' })
  rosterRole!: RosterRole;
  @ApiProperty({ enum: ADMIN_MEMBER_STATUSES }) status!: AdminMemberStatus;
  @ApiProperty({ format: 'date-time' }) joinedAt!: Date;
  @ApiProperty({ type: [AdminMemberGroupDto], description: 'Current groups, not deleted, by name' })
  groups!: AdminMemberGroupDto[];
}

export class AdminMemberPageDto {
  @ApiProperty({ type: [AdminMemberDto], description: 'Newest first; the owner is not a roster row' })
  items!: AdminMemberDto[];
  @ApiProperty({ example: 87 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 50 }) limit!: number;
}

export class AdminReviewSettingsDto {
  @ApiProperty({ example: 48 }) respondWithinHours!: number;
  @ApiProperty({ example: 72 }) escalateAfterHours!: number;
  @ApiProperty({ enum: ['school_admins', 'owner', 'primary_teacher'] }) escalateTo!: string;
}

export class AdminReviewAiSettingsDto {
  @ApiProperty({ enum: ['teacher_only', 'ai_then_teacher', 'ai_with_sampling'] }) mode!: string;
  @ApiProperty({ example: 168 }) autoAcceptAfterHours!: number;
  @ApiProperty({ example: 15 }) samplePercent!: number;
}

export class AdminAssistantSettingsDto {
  @ApiProperty({ enum: ['off', 'all_students', 'selected_groups', 'selected_students'] }) mode!: string;
  @ApiProperty({ type: [String], description: 'Kept whatever the mode; cut to groups not deleted' }) groupIds!: string[];
  @ApiProperty({ type: [String], description: 'Kept whatever the mode; cut to active students' }) studentIds!: string[];
}

export class AdminAiPrecheckSettingsDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: Number, nullable: true, description: 'null = no limit of the school', example: 3 })
  perExerciseLimit!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'null = no limit of the school' })
  perLearnerMonthlyCredits!: number | null;
}

export class AdminSchoolSettingsDto {
  @ApiProperty({ type: AdminReviewSettingsDto, description: 'Response time the school promises' })
  review!: AdminReviewSettingsDto;
  @ApiProperty({ type: AdminReviewAiSettingsDto, description: 'Who answers a learner’s work first (plan 80)' })
  reviewAi!: AdminReviewAiSettingsDto;
  @ApiProperty({ type: AdminAssistantSettingsDto, description: 'Assistant on the school’s account (plan 83)' })
  assistant!: AdminAssistantSettingsDto;
  @ApiProperty({ type: AdminAiPrecheckSettingsDto, description: 'Pre-hand-in check (plan 84)' })
  aiPrecheck!: AdminAiPrecheckSettingsDto;
}
