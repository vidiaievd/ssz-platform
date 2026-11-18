import { ApiProperty } from '@nestjs/swagger';
import { ADMIN_MEMBER_ROLES, ADMIN_MEMBER_STATUSES, type AdminMemberRole, type AdminMemberStatus, type RosterRole } from '../../domain/admin-school-roster.js';
import { ADMIN_SCHOOL_STATUSES, type AdminSchoolStatus, type SchoolKindValue } from '../../domain/admin-school.js';
import { AdminMemberGroupDto } from './admin-school-roster.dto.js';

const ROSTER_ROLES: readonly RosterRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'CONTENT_ADMIN', 'TEACHER', 'STUDENT', 'SCHEDULER'];

export class AdminUserSchoolRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Nordick' }) name!: string;
  @ApiProperty({ example: 'nordick' }) slug!: string;
  @ApiProperty({ enum: ['SCHOOL', 'SOLO'] }) kind!: SchoolKindValue;
  @ApiProperty({ enum: ADMIN_SCHOOL_STATUSES.filter((s) => s !== 'purged'), description: 'Purged schools are not listed' })
  status!: AdminSchoolStatus;
  @ApiProperty({ type: Date, nullable: true, description: 'When a suspended school closes by itself' })
  closesAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true, description: 'When a closed school is purged' })
  purgeAt!: Date | null;
}

export class AdminUserOwnedSchoolDto extends AdminUserSchoolRefDto {
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: [AdminMemberGroupDto], description: 'Groups the owner teaches today, by name' })
  groups!: AdminMemberGroupDto[];
}

export class AdminUserMembershipDto {
  @ApiProperty({ type: AdminUserSchoolRefDto }) school!: AdminUserSchoolRefDto;
  @ApiProperty({ enum: ADMIN_MEMBER_ROLES }) role!: AdminMemberRole;
  @ApiProperty({ enum: ROSTER_ROLES, description: 'The exact roster role, e.g. MANAGER inside staff' })
  rosterRole!: RosterRole;
  @ApiProperty({ enum: ADMIN_MEMBER_STATUSES }) status!: AdminMemberStatus;
  @ApiProperty({ format: 'date-time' }) joinedAt!: Date;
  @ApiProperty({ type: [AdminMemberGroupDto], description: 'Current groups, not deleted, by name' })
  groups!: AdminMemberGroupDto[];
}

export class AdminUserSchoolsDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ type: [AdminUserOwnedSchoolDto], description: 'Schools and SOLO workspaces the user owns, newest first' })
  owned!: AdminUserOwnedSchoolDto[];
  @ApiProperty({ type: [AdminUserMembershipDto], description: 'Roster rows of the user, newest first' })
  memberships!: AdminUserMembershipDto[];
}
