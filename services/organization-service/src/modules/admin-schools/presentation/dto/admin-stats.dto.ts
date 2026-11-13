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
  @ApiProperty({ example: 3 }) inactive!: number;
  @ApiProperty({ example: 1 }) deleted!: number;
}

export class AdminStatsByKindDto {
  @ApiProperty({ example: 30 }) SCHOOL!: number;
  @ApiProperty({ example: 12 }) SOLO!: number;
}

export class AdminStatsSchoolsDto {
  @ApiProperty({ description: 'Every workspace row, deleted ones included', example: 42 }) total!: number;
  @ApiProperty({ type: AdminStatsByStatusDto }) byStatus!: AdminStatsByStatusDto;
  @ApiProperty({ type: AdminStatsByKindDto }) byKind!: AdminStatsByKindDto;
  @ApiProperty({ example: 3 }) createdInPeriod!: number;
}

export class AdminStatsPeopleDto {
  @ApiProperty({ description: 'Distinct people now, schools not deleted', example: 1280 }) total!: number;
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

export class AdminStatsDto {
  @ApiProperty({ example: '2026-10-11' }) from!: string;
  @ApiProperty({ example: '2026-11-09' }) to!: string;
  @ApiProperty({ type: AdminStatsSchoolsDto }) schools!: AdminStatsSchoolsDto;
  @ApiProperty({ type: AdminStatsPeopleDto, description: 'Active student rows now' }) students!: AdminStatsPeopleDto;
  @ApiProperty({ type: AdminStatsPeopleDto, description: 'TEACHER rows plus SOLO tutors (owners, not on the roster)' })
  teachers!: AdminStatsPeopleDto;
  @ApiProperty({ type: [AdminStatsDayDto], description: 'Every day of the period, zeros included' })
  daily!: AdminStatsDayDto[];
}
