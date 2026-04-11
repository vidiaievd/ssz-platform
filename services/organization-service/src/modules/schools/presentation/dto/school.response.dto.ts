import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberRole } from '../../domain/value-objects/member-role.vo.js';

export class SchoolMemberResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty({ enum: MemberRole }) role: MemberRole;
  @ApiProperty() joinedAt: Date;
}

export class SchoolResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() ownerId: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: [SchoolMemberResponseDto] }) members: SchoolMemberResponseDto[];
}

export class SchoolSummaryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() ownerId: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiProperty() memberCount: number;
  @ApiProperty() createdAt: Date;
}

export class CreateSchoolResponseDto {
  @ApiProperty() id: string;
}

export class SendInvitationResponseDto {
  @ApiProperty({ description: 'Invitation token to share with the invitee' })
  token: string;
}
