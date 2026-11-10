import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AdminStatsQueryDto {
  @ApiPropertyOptional({ description: 'First UTC day, inclusive; default 29 days before `to`', example: '2026-10-11' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Last UTC day, inclusive; default today', example: '2026-11-09' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class AdminStatsByStatusDto {
  @ApiProperty({ example: 38 }) active!: number;
  @ApiProperty({ example: 2 }) suspended!: number;
  @ApiProperty({ example: 1 }) closed!: number;
  @ApiProperty({ example: 0 }) purged!: number;
}

export class AdminStatsByKindDto {
  @ApiProperty({ example: 30 }) SCHOOL!: number;
  @ApiProperty({ example: 12 }) SOLO!: number;
}

export class AdminStatsSchoolsDto {
  @ApiProperty({ description: 'Every workspace row, closed and purged ones included', example: 42 }) total!: number;
  @ApiProperty({ type: AdminStatsByStatusDto }) byStatus!: AdminStatsByStatusDto;
  @ApiProperty({ type: AdminStatsByKindDto }) byKind!: AdminStatsByKindDto;
  @ApiProperty({ example: 3 }) createdInPeriod!: number;
}

export class AdminStatsPeopleDto {
  @ApiProperty({ description: 'Distinct people now, schools not closed or purged', example: 1280 }) total!: number;
  @ApiProperty({ description: 'Distinct people whose first row falls in the period', example: 112 })
  newInPeriod!: number;
}

export class AdminStatsDayDto {
  @ApiProperty({ example: '2026-11-09' }) date!: string;
  @ApiProperty({ description: 'Workspaces created that day' }) schools!: number;
  @ApiProperty({ description: 'People who first became a student that day' }) students!: number;
  @ApiProperty({ description: 'People who first became a teacher (roster or SOLO tutor) that day' })
  teachers!: number;
}

export class AdminSeatsAttentionItemDto {
  @ApiProperty({ format: 'uuid' }) schoolId!: string;
  @ApiProperty({ example: 'Nordick' }) name!: string;
  @ApiProperty({ example: 'nordick' }) slug!: string;
  @ApiProperty({ example: 97 }) used!: number;
  @ApiProperty({ example: 100 }) limit!: number;
}

export class AdminSeatsAttentionDto {
  @ApiProperty({ description: 'Schools in this state, all of them', example: 4 }) total!: number;
  @ApiProperty({ type: [AdminSeatsAttentionItemDto], description: 'Up to 100, the most crowded first' })
  items!: AdminSeatsAttentionItemDto[];
  @ApiProperty({ description: 'More schools than `items` holds' }) truncated!: boolean;
}

export class AdminSeatsStatsDto {
  @ApiProperty({ description: 'Active students of schools (not deleted) with a numeric limit', example: 640 })
  used!: number;
  @ApiProperty({ description: 'Their limits summed', example: 900 }) limit!: number;
  @ApiProperty({ example: 14 }) schoolsLimited!: number;
  @ApiProperty({ type: AdminSeatsAttentionDto, description: '90 % of the limit or more, not over it' })
  near!: AdminSeatsAttentionDto;
  @ApiProperty({ type: AdminSeatsAttentionDto, description: 'More active students than the limit' })
  over!: AdminSeatsAttentionDto;
}

export class AdminStatsDto {
  @ApiProperty({ example: '2026-10-11' }) from!: string;
  @ApiProperty({ example: '2026-11-09' }) to!: string;
  @ApiProperty({ type: AdminStatsSchoolsDto }) schools!: AdminStatsSchoolsDto;
  @ApiProperty({ type: AdminStatsPeopleDto, description: 'Active student rows now' }) students!: AdminStatsPeopleDto;
  @ApiProperty({ type: AdminStatsPeopleDto, description: 'TEACHER rows plus SOLO tutors (owners, not on the roster)' })
  teachers!: AdminStatsPeopleDto;
  @ApiProperty({ type: [AdminStatsDayDto], description: 'Every day of the period, zeros included' })
  daily!: AdminStatsDayDto[];
  @ApiProperty({ type: AdminSeatsStatsDto, description: 'Student seats against the projected plan limits' })
  seats!: AdminSeatsStatsDto;
}
