import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  ADMIN_SCHOOL_SEATS_FILTERS,
  ADMIN_SCHOOL_SORTS,
  ADMIN_SCHOOL_STATUSES,
  ADMIN_SCHOOLS_PAGE_MAX,
  type AdminSchoolSeatsFilter,
  type AdminSchoolSort,
  type AdminSchoolStatus,
  type SchoolKindValue,
} from '../../domain/admin-school.js';

const KINDS: readonly SchoolKindValue[] = ['SCHOOL', 'SOLO'];
/** Any UUID version: seeded schools carry v5 ids. */
const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `ids=a,b` (or a repeated `ids=`) → distinct trimmed values; an empty one stays and fails the UUID check. */
function splitIds({ value }: { value: unknown }): unknown {
  if (value === undefined) return undefined;
  const parts = (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(','));
  return [...new Set(parts.map((p) => p.trim()))];
}

export class ListAdminSchoolsQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive part of the name or the slug', example: 'nord' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Comma-separated school ids, 1–100: only these rows (a batch read of names). Unknown ids are absent, not an ' +
      'error. Combines with the other filters; pass `limit` ≥ the number of ids to get them on one page.',
    example: '6f1c2a9e-0b7d-4e3a-9c55-1d2e3f4a5b6c,0a1b2c3d-4e5f-5a6b-8c7d-9e0f1a2b3c4d',
  })
  @IsOptional()
  @Transform(splitIds)
  @ArrayMinSize(1)
  @ArrayMaxSize(ADMIN_SCHOOLS_PAGE_MAX)
  @Matches(UUID_ANY, { each: true, message: 'ids must be UUIDs' })
  ids?: string[];

  @ApiPropertyOptional({ enum: KINDS, description: 'SCHOOL = an organisation, SOLO = a private tutor' })
  @IsOptional()
  @IsIn(KINDS)
  kind?: SchoolKindValue;

  @ApiPropertyOptional({ enum: ADMIN_SCHOOL_STATUSES, description: 'None = every row, closed and purged ones included' })
  @IsOptional()
  @IsIn(ADMIN_SCHOOL_STATUSES)
  status?: AdminSchoolStatus;

  @ApiPropertyOptional({
    enum: ADMIN_SCHOOL_SEATS_FILTERS,
    description:
      '`near` = 90 % of the student limit or more, not over it; `over` = more active students than the limit. ' +
      'Schools without a numeric limit match neither.',
  })
  @IsOptional()
  @IsIn(ADMIN_SCHOOL_SEATS_FILTERS)
  seats?: AdminSchoolSeatsFilter;

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

export class AdminSchoolListSeatsDto {
  @ApiProperty({ description: 'Active students (= counts.students)', example: 87 }) used!: number;
  @ApiProperty({ type: Number, nullable: true, example: 100, description: 'null = no limit stated or not projected yet' })
  limit!: number | null;
}

export class AdminSchoolSeatsDto extends AdminSchoolListSeatsDto {
  @ApiProperty({ type: Number, nullable: true, example: 110, description: 'limit + 10 % grace; null = no limit' })
  ceiling!: number | null;
  @ApiProperty({ enum: ['ok', 'warning', 'full'] }) state!: string;
}

export class AdminSchoolListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Nordick' }) name!: string;
  @ApiProperty({ example: 'nordick' }) slug!: string;
  @ApiProperty({ enum: KINDS }) kind!: SchoolKindValue;
  @ApiProperty({ enum: ADMIN_SCHOOL_STATUSES }) status!: AdminSchoolStatus;
  @ApiProperty({ type: Date, nullable: true, format: 'date-time', description: 'When a suspended school closes by itself' })
  closesAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true, format: 'date-time', description: 'When a closed school is purged' })
  purgeAt!: Date | null;
  @ApiProperty({ description: 'userId of the owner' }) ownerId!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Oslo' }) city!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: AdminSchoolCountsDto }) counts!: AdminSchoolCountsDto;
  @ApiProperty({ type: AdminSchoolListSeatsDto }) seats!: AdminSchoolListSeatsDto;
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
  @ApiProperty({ type: Date, nullable: true, format: 'date-time' }) statusChangedAt!: Date | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "The admin's reason for the current status; null when the owner or the timer moved it",
  })
  statusReason!: string | null;
  @ApiProperty({ type: Date, nullable: true, format: 'date-time', description: 'When a suspended school closes by itself' })
  closesAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true, format: 'date-time', description: 'When a closed school is purged' })
  purgeAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ type: AdminSchoolContactsDto }) contacts!: AdminSchoolContactsDto;
  @ApiProperty({ type: AdminSchoolOwnerDto }) owner!: AdminSchoolOwnerDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({
    type: Date,
    nullable: true,
    format: 'date-time',
    description: 'Mirrors the status: when the school was closed (set while closed or purged)',
  })
  deletedAt!: Date | null;
  @ApiProperty({ type: AdminSchoolDetailCountsDto }) counts!: AdminSchoolDetailCountsDto;
  @ApiProperty({ type: AdminSchoolSeatsDto, description: 'Student seats against the projected plan limit' })
  seats!: AdminSchoolSeatsDto;
  @ApiProperty({ type: [AdminSchoolGroupDto], description: 'Groups not deleted, newest first' })
  groups!: AdminSchoolGroupDto[];
  @ApiProperty({ type: AdminSchoolCoursesDto }) courses!: AdminSchoolCoursesDto;
}
