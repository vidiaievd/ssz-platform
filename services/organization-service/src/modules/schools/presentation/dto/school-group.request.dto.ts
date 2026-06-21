import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  IsDateString,
  Matches,
} from 'class-validator';

export class CreateSchoolGroupRequestDto {
  @ApiProperty({ example: 'Level A2 — Spring 2026' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Beginner group, morning sessions' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ enum: ['online', 'in_person'], default: 'online' })
  @IsOptional()
  @IsEnum(['online', 'in_person'])
  mode?: 'online' | 'in_person';

  @ApiPropertyOptional({ description: 'UUID of the linked course (content container)' })
  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @ApiPropertyOptional({ example: 'en', description: 'ISO 639-1 language code' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/, { message: 'lang must be a 2-letter ISO 639-1 code' })
  lang?: string | null;

  @ApiPropertyOptional({ example: 'A2', description: 'CEFR level (A1–C2)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  level?: string | null;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacityMin?: number | null;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacityMax?: number | null;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}

export class UpdateSchoolGroupRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ enum: ['online', 'in_person'] })
  @IsOptional()
  @IsEnum(['online', 'in_person'])
  mode?: 'online' | 'in_person';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/, { message: 'lang must be a 2-letter ISO 639-1 code' })
  lang?: string | null;

  @ApiPropertyOptional({ example: 'B1' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  level?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacityMin?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacityMax?: number | null;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}

export class AddGroupMemberRequestDto {
  @ApiProperty({ description: 'userId of an existing school member' })
  @IsString()
  userId!: string;
}

export class UpdateGroupMemberRoleRequestDto {
  @ApiProperty({ enum: ['student', 'trial', 'observer'] })
  @IsEnum(['student', 'trial', 'observer'])
  role!: 'student' | 'trial' | 'observer';
}

export class AssignGroupTeacherRequestDto {
  @ApiProperty({ description: 'userId of the teacher (must be a TEACHER school member)' })
  @IsString()
  userId!: string;

  @ApiProperty({ enum: ['primary', 'co_primary', 'substitute'] })
  @IsEnum(['primary', 'co_primary', 'substitute'])
  role!: 'primary' | 'co_primary' | 'substitute';

  @ApiPropertyOptional({ description: 'Start date for substitute window (ISO date)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string | null;

  @ApiPropertyOptional({ description: 'End date for substitute window (ISO date)' })
  @IsOptional()
  @IsDateString()
  toDate?: string | null;

  @ApiPropertyOptional({ description: 'Required for substitute role' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @ApiPropertyOptional({ description: 'Override existing primary/co_primary assignment' })
  @IsOptional()
  override?: boolean;
}

export class AddGroupMaterialRequestDto {
  @ApiProperty({ description: 'UUID of the content container (course) to attach' })
  @IsUUID()
  courseId!: string;
}
