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

  @ApiPropertyOptional({ description: 'Display name of the inviting user' })
  invitedByName!: string | null;

  @ApiProperty({ enum: ['pending', 'accepted', 'expired', 'revoked'], description: 'Current invitation status' })
  status!: string;

  @ApiProperty({ description: 'Invitation expiry (ISO 8601)' })
  expiresAt!: string;
}
