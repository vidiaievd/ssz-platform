import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ADMIN_SCHOOL_SORTS,
  ADMIN_SCHOOL_STATUSES,
  ADMIN_SCHOOLS_PAGE_MAX,
  type AdminSchoolSort,
  type AdminSchoolStatus,
  type SchoolKindValue,
} from '../../domain/admin-school.js';

const KINDS: readonly SchoolKindValue[] = ['SCHOOL', 'SOLO'];

export class ListAdminSchoolsQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive part of the name or the slug', example: 'nord' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: KINDS, description: 'SCHOOL = an organisation, SOLO = a private tutor' })
  @IsOptional()
  @IsIn(KINDS)
  kind?: SchoolKindValue;

  @ApiPropertyOptional({ enum: ADMIN_SCHOOL_STATUSES, description: 'None = every row, soft-deleted ones included' })
  @IsOptional()
  @IsIn(ADMIN_SCHOOL_STATUSES)
  status?: AdminSchoolStatus;

  @ApiPropertyOptional({ enum: ADMIN_SCHOOL_SORTS, default: '-createdAt', description: '`-` = descending' })
  @IsOptional()
  @IsIn(ADMIN_SCHOOL_SORTS)
  sort?: AdminSchoolSort;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: ADMIN_SCHOOLS_PAGE_MAX, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_SCHOOLS_PAGE_MAX)
  limit?: number;
}

export class AdminSchoolCountsDto {
  @ApiProperty({ description: 'Active STUDENT rows on the roster', example: 87 }) students!: number;
  @ApiProperty({ description: 'TEACHER rows; the owner is not counted (not a roster row)', example: 6 })
  teachers!: number;
}

export class AdminSchoolListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Nordick' }) name!: string;
  @ApiProperty({ example: 'nordick' }) slug!: string;
  @ApiProperty({ enum: KINDS }) kind!: SchoolKindValue;
  @ApiProperty({ enum: ADMIN_SCHOOL_STATUSES }) status!: AdminSchoolStatus;
  @ApiProperty({ description: 'userId of the owner' }) ownerId!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Oslo' }) city!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: AdminSchoolCountsDto }) counts!: AdminSchoolCountsDto;
}

export class AdminSchoolPageDto {
  @ApiProperty({ type: [AdminSchoolListItemDto] }) items!: AdminSchoolListItemDto[];
  @ApiProperty({ description: 'Rows matching the filters, all pages', example: 42 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 25 }) limit!: number;
}

export class AdminSchoolDetailCountsDto extends AdminSchoolCountsDto {
  @ApiProperty({ example: 4 }) archivedStudents!: number;
  @ApiProperty({ description: 'ADMIN, MANAGER, CONTENT_ADMIN and SCHEDULER rows', example: 2 }) staff!: number;
  @ApiProperty({ description: 'Applications waiting: pending or placement review', example: 3 })
  pendingApplications!: number;
  @ApiProperty({ description: 'Invitations pending and not expired', example: 1 }) pendingInvitations!: number;
}

export class AdminSchoolGroupDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'A2 kveld' }) name!: string;
  @ApiProperty({ enum: ['draft', 'active', 'archived'] }) status!: string;
  @ApiProperty({ description: "A SOLO workspace's hidden group that holds every learner" }) isDefault!: boolean;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'A2' }) level!: string | null;
  @ApiProperty({ description: 'Active members with the student role', example: 12 }) students!: number;
}

export class AdminSchoolContactsDto {
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) website!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
}

export class AdminSchoolOwnerDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'From profile-service; null when it does not answer' })
  name!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
}

export class AdminSchoolCoursesDto {
  @ApiProperty({ example: 2 }) count!: number;
  @ApiProperty({ type: [String], description: 'Course ids; names live in content-service' }) ids!: string[];
}

export class AdminSchoolDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: KINDS }) kind!: SchoolKindValue;
  @ApiProperty({ enum: ['ONLINE', 'HYBRID'] }) type!: string;
  @ApiProperty({ enum: ADMIN_SCHOOL_STATUSES }) status!: AdminSchoolStatus;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ type: AdminSchoolContactsDto }) contacts!: AdminSchoolContactsDto;
  @ApiProperty({ type: AdminSchoolOwnerDto }) owner!: AdminSchoolOwnerDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ type: Date, nullable: true, format: 'date-time' }) deletedAt!: Date | null;
  @ApiProperty({ type: AdminSchoolDetailCountsDto }) counts!: AdminSchoolDetailCountsDto;
  @ApiProperty({ type: [AdminSchoolGroupDto], description: 'Groups not deleted, newest first' })
  groups!: AdminSchoolGroupDto[];
  @ApiProperty({ type: AdminSchoolCoursesDto }) courses!: AdminSchoolCoursesDto;
}
