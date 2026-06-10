import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TutoringStudentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() joinedAt!: Date;
}

export class TutoringGroupResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tutorId!: string;
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [TutoringStudentResponseDto] }) students!: TutoringStudentResponseDto[];
}

export class TutoringGroupSummaryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tutorId!: string;
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiProperty() studentCount!: number;
  @ApiProperty() createdAt!: Date;
}

export class CreateTutoringGroupResponseDto {
  @ApiProperty() id!: string;
}

export class SendTutoringInvitationResponseDto {
  @ApiProperty({ description: 'Invitation UUID' }) invitationId!: string;
  @ApiProperty({ description: 'Signed JWT token to embed in the invite link' }) token!: string;
  @ApiProperty({ description: 'Invitation expiry (ISO 8601)' }) expiresAt!: string;
  @ApiProperty({ enum: ['queued'] }) deliveryStatus!: 'queued';
}

export class TutoringInvitationResponseDto {
  @ApiProperty() invitationId!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['pending', 'accepted', 'expired', 'revoked'] }) status!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() expiresAt!: string;
  @ApiPropertyOptional() acceptedAt?: string | null;
  @ApiProperty() lastSentAt!: string;
  @ApiProperty() resendCount!: number;
}

export class ResendTutoringInvitationResponseDto {
  @ApiProperty() invitationId!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ enum: ['queued'] }) deliveryStatus!: 'queued';
  @ApiProperty() resendCount!: number;
}

/** @deprecated use TutoringInvitationResponseDto */
export class PendingTutoringInvitationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() createdAt!: Date;
}
