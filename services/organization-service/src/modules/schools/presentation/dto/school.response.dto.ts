import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MemberRole } from "../../domain/value-objects/member-role.vo.js";
import { InvitationStatus } from "../../domain/value-objects/invitation-status.vo.js";

export class InvitationResponseDto {
  @ApiProperty({ description: 'Invitation UUID' })
  id!: string;

  @ApiProperty({ description: 'School UUID' })
  schoolId!: string;

  @ApiProperty({ description: 'Invitee email address' })
  email!: string;

  @ApiProperty({ enum: MemberRole, description: 'Role assigned on acceptance' })
  role!: MemberRole;

  @ApiProperty({ enum: InvitationStatus, description: 'Current invitation status' })
  status!: InvitationStatus;

  @ApiProperty({ description: 'Invitation expiry (ISO 8601)' })
  expiresAt!: string;

  @ApiProperty({ description: 'Creation timestamp (ISO 8601)' })
  createdAt!: string;
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
  @ApiPropertyOptional() description?: string;
  @ApiProperty() ownerId!: string;
  @ApiPropertyOptional() avatarUrl?: string;
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
  @ApiPropertyOptional() description?: string;
  @ApiProperty() ownerId!: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiProperty() memberCount!: number;
  @ApiProperty() createdAt!: Date;
}

export class CreateSchoolResponseDto {
  @ApiProperty() id!: string;
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
