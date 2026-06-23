import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type WeekDayEnum = (typeof WEEKDAYS)[number];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ProposedSlotDto {
  @ApiProperty({ enum: WEEKDAYS, example: 'mon' })
  @IsEnum(WEEKDAYS)
  weekday!: WeekDayEnum;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @ApiProperty({ example: '10:30' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:MM' })
  endTime!: string;
}

export class TeacherAvailabilityQueryDto {
  @ApiProperty({
    type: [ProposedSlotDto],
    description: 'JSON-encoded array of proposed weekly slots, e.g. slots=[{"weekday":"mon","startTime":"09:00","endTime":"10:00"}]',
  })
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposedSlotDto)
  slots!: ProposedSlotDto[];
}

export class TeacherAvailabilityEntryDto {
  @ApiProperty() teacherId!: string;
  @ApiProperty({ enum: ['free', 'conflict', 'absent'] }) status!: 'free' | 'conflict' | 'absent';
  @ApiPropertyOptional({ description: 'Group whose lesson overlaps a proposed slot, when status is conflict' })
  conflictGroupId?: string | null;
  @ApiPropertyOptional({ description: 'Absence record covering today, when status is absent' })
  absenceId?: string | null;
}

export class TeacherTimetableEntryDto {
  @ApiProperty({ enum: WEEKDAYS }) weekday!: WeekDayEnum;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiProperty() groupId!: string;
  @ApiPropertyOptional() room?: string | null;
}

export class SchoolTimetableEntryDto extends TeacherTimetableEntryDto {
  @ApiProperty() teacherId!: string;
}

export class WorkloadPolicyDto {
  @ApiProperty() prepFactor!: number;
  @ApiProperty() dailyContactCap!: number;
  @ApiProperty() maxConsecutive!: number;
  @ApiProperty() nearCapRatio!: number;
}

export class UpdateWorkloadPolicyDto {
  @ApiPropertyOptional({ example: 0.3 })
  @IsOptional() @IsNumber() @Min(0) @Max(2)
  prepFactor?: number;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional() @IsNumber() @Min(1) @Max(12)
  dailyContactCap?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional() @IsNumber() @Min(1) @Max(8)
  maxConsecutive?: number;

  @ApiPropertyOptional({ example: 0.85 })
  @IsOptional() @IsNumber() @Min(0.5) @Max(1)
  nearCapRatio?: number;
}

export class TeacherLoadDto {
  @ApiProperty() teacherId!: string;
  @ApiProperty() contactHours!: number;
  @ApiProperty() prepHours!: number;
  @ApiProperty() effectiveHours!: number;
  @ApiProperty() distinctGroups!: number;
  @ApiProperty() dailyPeak!: number;
  @ApiProperty({ enum: ['ok', 'warn', 'danger'] }) health!: string;
  @ApiProperty() overloaded!: boolean;
}

export class ConflictEntryDto {
  @ApiProperty() teacherId!: string;
  @ApiProperty() date!: string;
  @ApiProperty() lessonAId!: string;
  @ApiProperty() lessonBId!: string;
}

export class CommandCenterDto {
  @ApiProperty() conflictCount!: number;
  @ApiProperty() overloadedTeachers!: number;
  @ApiProperty() nearCapTeachers!: number;
  @ApiProperty({ type: [TeacherLoadDto] }) teacherLoads!: TeacherLoadDto[];
}
