import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SchoolGroup } from '../../domain/entities/school-group.entity.js';

export class SchoolGroupMemberResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() addedAt!: Date;
}

export class GroupTeacherResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: ['primary', 'co_primary', 'substitute'] }) role!: string;
  @ApiPropertyOptional() fromDate?: Date | null;
  @ApiPropertyOptional() toDate?: Date | null;
  @ApiPropertyOptional() reason?: string | null;
}

export class SchoolGroupResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty({ enum: ['draft', 'active', 'archived'] }) status!: string;
  @ApiProperty({ enum: ['online', 'in_person'] }) mode!: string;
  @ApiPropertyOptional() courseId?: string | null;
  @ApiPropertyOptional() lang?: string | null;
  @ApiPropertyOptional() level?: string | null;
  @ApiPropertyOptional() capacityMin?: number | null;
  @ApiPropertyOptional() capacityMax?: number | null;
  @ApiPropertyOptional() startDate?: Date | null;
  @ApiPropertyOptional() endDate?: Date | null;
  @ApiProperty() studentCount!: number;
  @ApiProperty({ type: [SchoolGroupMemberResponseDto] }) members!: SchoolGroupMemberResponseDto[];
  @ApiProperty({ type: [GroupTeacherResponseDto] }) teachers!: GroupTeacherResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromDomain(group: SchoolGroup): SchoolGroupResponseDto {
    const dto = new SchoolGroupResponseDto();
    dto.id = group.id;
    dto.schoolId = group.schoolId;
    dto.name = group.name;
    dto.description = group.description;
    dto.status = group.status;
    dto.mode = group.mode;
    dto.courseId = group.courseId;
    dto.lang = group.lang;
    dto.level = group.level;
    dto.capacityMin = group.capacityMin;
    dto.capacityMax = group.capacityMax;
    dto.startDate = group.startDate;
    dto.endDate = group.endDate;
    dto.studentCount = group.studentCount;
    dto.members = group.members.map((m) => ({ id: m.id, userId: m.userId, addedAt: m.addedAt }));
    dto.teachers = group.teachers.map((t) => ({
      id: t.id,
      userId: t.userId,
      role: t.role,
      fromDate: t.fromDate,
      toDate: t.toDate,
      reason: t.reason,
    }));
    dto.createdAt = group.createdAt;
    dto.updatedAt = group.updatedAt;
    return dto;
  }
}

export class SchoolGroupSummaryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty({ enum: ['draft', 'active', 'archived'] }) status!: string;
  @ApiProperty({ enum: ['online', 'in_person'] }) mode!: string;
  @ApiPropertyOptional() courseId?: string | null;
  @ApiPropertyOptional() lang?: string | null;
  @ApiPropertyOptional() level?: string | null;
  @ApiPropertyOptional() capacityMin?: number | null;
  @ApiPropertyOptional() capacityMax?: number | null;
  @ApiPropertyOptional() startDate?: Date | null;
  @ApiPropertyOptional() endDate?: Date | null;
  @ApiProperty() studentCount!: number;
  @ApiProperty({ type: [GroupTeacherResponseDto] }) teachers!: GroupTeacherResponseDto[];
  @ApiProperty() createdAt!: Date;

  static fromDomain(group: SchoolGroup): SchoolGroupSummaryResponseDto {
    const dto = new SchoolGroupSummaryResponseDto();
    dto.id = group.id;
    dto.schoolId = group.schoolId;
    dto.name = group.name;
    dto.description = group.description;
    dto.status = group.status;
    dto.mode = group.mode;
    dto.courseId = group.courseId;
    dto.lang = group.lang;
    dto.level = group.level;
    dto.capacityMin = group.capacityMin;
    dto.capacityMax = group.capacityMax;
    dto.startDate = group.startDate;
    dto.endDate = group.endDate;
    dto.studentCount = group.studentCount;
    dto.teachers = group.teachers.map((t) => ({
      id: t.id,
      userId: t.userId,
      role: t.role,
      fromDate: t.fromDate,
      toDate: t.toDate,
      reason: t.reason,
    }));
    dto.createdAt = group.createdAt;
    return dto;
  }
}
