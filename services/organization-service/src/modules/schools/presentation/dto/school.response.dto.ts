import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MemberRole } from "../../domain/value-objects/member-role.vo.js";
import { InvitationStatus } from "../../domain/value-objects/invitation-status.vo.js";
import { SchoolType } from "../../domain/value-objects/school-type.vo.js";

export class InvitationResponseDto {
  @ApiProperty({ description: 'Invitation UUID' })
  invitationId!: string;

  @ApiProperty({ description: 'Invitee email address' })
  email!: string;

  @ApiProperty({ enum: MemberRole, description: 'Role assigned on acceptance' })
  role!: MemberRole;

  @ApiPropertyOptional({ enum: ['register', 'onboard_existing'] })
  kind?: string;

  @ApiProperty({ enum: InvitationStatus, description: 'Current invitation status' })
  status!: InvitationStatus;

  @ApiPropertyOptional({ description: 'Target group UUID (students only)' })
  targetGroupId?: string | null;

  @ApiPropertyOptional({ description: 'Target group name (denormalized)' })
  targetGroupName?: string | null;

  @ApiPropertyOptional({ description: 'Display name of the user who sent the invite' })
  invitedByName?: string | null;

  @ApiProperty({ description: 'Creation timestamp (ISO 8601)' })
  createdAt!: string;

  @ApiProperty({ description: 'Expiry timestamp (ISO 8601)' })
  expiresAt!: string;

  @ApiPropertyOptional({ description: 'Accept timestamp (ISO 8601), null if not yet accepted' })
  acceptedAt?: string | null;

  @ApiProperty({ description: 'Last send timestamp (ISO 8601)' })
  lastSentAt!: string;

  @ApiProperty({ description: 'How many times the invite was resent', default: 0 })
  resendCount!: number;
}

export class ResendInvitationResponseDto {
  @ApiProperty() invitationId!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ enum: ['queued'] }) deliveryStatus!: 'queued';
  @ApiProperty() resendCount!: number;
}

export class SchoolMemberResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: MemberRole }) role!: MemberRole;
  @ApiProperty() joinedAt!: Date;
}

export class SchoolResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() ownerId!: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiPropertyOptional() website?: string;
  @ApiPropertyOptional() contactEmail?: string;
  @ApiPropertyOptional() city?: string;
  @ApiProperty({ enum: SchoolType, default: SchoolType.ONLINE }) type!: SchoolType;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ default: false }) requireTutorReviewForSelfPaced!: boolean;
  @ApiPropertyOptional() defaultExplanationLanguage?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [SchoolMemberResponseDto] })
  members!: SchoolMemberResponseDto[];
}

export class SchoolSummaryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() ownerId!: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiPropertyOptional() website?: string;
  @ApiPropertyOptional() contactEmail?: string;
  @ApiPropertyOptional() city?: string;
  @ApiProperty() memberCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({
    enum: MemberRole,
    description: 'Caller\'s role in this school',
  })
  myRole!: MemberRole;
  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    description:
      'Caller\'s capabilities. MANAGER: DB-stored set. TEACHER/STUDENT: []. OWNER/ADMIN/CONTENT_ADMIN/SCHEDULER: null (all access is role-based).',
    example: ['invitations:create_teacher', 'groups:create'],
  })
  myCapabilities!: string[] | null;
}

export class SendInvitationResponseDto {
  @ApiProperty({ description: 'Invitation UUID' })
  invitationId!: string;

  @ApiProperty({ description: 'Signed JWT token to embed in the invite link' })
  token!: string;

  @ApiProperty({ description: 'Invitation expiry (ISO 8601)' })
  expiresAt!: string;

  @ApiProperty({
    description: 'Email delivery status: "queued" until Notification Service confirms',
    enum: ['queued'],
  })
  deliveryStatus!: 'queued';
}

export class SlugAvailabilityResponseDto {
  @ApiProperty({ example: true }) available!: boolean;
  @ApiPropertyOptional({ type: [String], example: ['my-school-2', 'my-school-3'] })
  suggestions?: string[];
}

export class MemberRosterGroupResponseDto {
  @ApiProperty({ description: 'Group UUID' })
  id!: string;

  @ApiProperty({ description: 'Group name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Group language (ISO 639-1)', nullable: true })
  lang!: string | null;

  @ApiPropertyOptional({ description: 'Group CEFR level', nullable: true })
  level!: string | null;
}

export class MemberRosterItemResponseDto {
  @ApiProperty({ description: 'User UUID' })
  userId!: string;

  @ApiProperty({ description: 'Display name from profile-service (userId fallback)' })
  name!: string;

  // Always null today — user-profile-service has no email field (email lives in
  // auth-service, not wired up here). Kept for API stability; do not rely on it.
  @ApiPropertyOptional({ description: 'Reserved — currently always null', nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ description: 'Avatar URL from profile-service', nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: MemberRole, description: 'Role in this school' })
  role!: MemberRole;

  @ApiProperty({ type: [String], description: 'Teaching languages (ISO 639-1); empty for non-teachers' })
  langs!: string[];

  @ApiPropertyOptional({ description: 'Max weekly teaching hours; null for non-teachers', nullable: true })
  maxWeeklyHours!: number | null;

  @ApiProperty({ description: 'Member status', enum: ['active', 'invited', 'inactive', 'suspended'] })
  status!: string;

  @ApiProperty({ description: 'Join timestamp (ISO 8601)' })
  joinedAt!: string;

  @ApiProperty({
    type: [MemberRosterGroupResponseDto],
    description: 'Active groups this student belongs to in this school; empty for non-students',
  })
  groups!: MemberRosterGroupResponseDto[];
}

export class MemberPermissionsResponseDto {
  @ApiPropertyOptional({ enum: MemberRole, description: 'Current role of the member in this school, or null if not a member' })
  role!: string | null;

  @ApiProperty({
    type: [String],
    description: 'Effective capabilities. OWNER/ADMIN get all; MANAGER gets DB-stored set; others get empty array.',
    example: ['invitations:create_teacher', 'groups:create'],
  })
  capabilities!: string[];
}

export class InvitationCountResponseDto {
  @ApiProperty({ description: 'Number of matching invitations', example: 3 })
  count!: number;
}

export class InvitationPreviewResponseDto {
  @ApiProperty({ description: 'School display name' })
  schoolName!: string;

  @ApiProperty({ description: 'School URL slug' })
  schoolSlug!: string;

  @ApiProperty({ enum: MemberRole, description: 'Role assigned on acceptance' })
  role!: MemberRole;

  @ApiProperty({ enum: ['register', 'onboard_existing'] })
  kind!: string;

  @ApiProperty({ description: 'Email the invitation was addressed to' })
  email!: string;

  @ApiPropertyOptional({ description: 'School-provided first name hint for pre-filling registration' })
  firstName!: string | null;

  @ApiPropertyOptional({ description: 'School-provided last name hint for pre-filling registration' })
  lastName!: string | null;

  @ApiPropertyOptional({ description: 'Display name of the inviting user' })
  invitedByName!: string | null;

  @ApiProperty({ enum: ['pending', 'accepted', 'expired', 'revoked'], description: 'Current invitation status' })
  status!: string;

  @ApiProperty({ description: 'Invitation expiry (ISO 8601)' })
  expiresAt!: string;

  @ApiPropertyOptional({
    description: 'Teaching languages (TEACHER role only)',
    type: 'array',
    items: { type: 'object', properties: { code: { type: 'string' }, level: { type: 'string', nullable: true } } },
    nullable: true,
  })
  teachingLanguages!: Array<{ code: string; level: string | null }> | null;
}

export class PublicSchoolResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  schoolId!: string;

  @ApiProperty({ example: 'lingua-kyiv' })
  schoolSlug!: string;

  @ApiProperty({ example: 'Lingua Kyiv' })
  schoolName!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiPropertyOptional()
  city?: string;

  @ApiPropertyOptional()
  website?: string;

  @ApiProperty({ description: 'Whether the school is currently accepting applications' })
  isOpenForApplications!: boolean;
}
