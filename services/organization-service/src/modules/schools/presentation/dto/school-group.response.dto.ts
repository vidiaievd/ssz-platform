import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SchoolGroup } from '../../domain/entities/school-group.entity.js';

export class SchoolGroupMemberResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() addedAt!: Date;
}

export class SchoolGroupResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty({ type: [SchoolGroupMemberResponseDto] }) members!: SchoolGroupMemberResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromDomain(group: SchoolGroup): SchoolGroupResponseDto {
    const dto = new SchoolGroupResponseDto();
    dto.id = group.id;
    dto.schoolId = group.schoolId;
    dto.name = group.name;
    dto.description = group.description;
    dto.members = group.members.map((m) => ({ id: m.id, userId: m.userId, addedAt: m.addedAt }));
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
  @ApiProperty() memberCount!: number;
  @ApiProperty() createdAt!: Date;

  static fromDomain(group: SchoolGroup): SchoolGroupSummaryResponseDto {
    const dto = new SchoolGroupSummaryResponseDto();
    dto.id = group.id;
    dto.schoolId = group.schoolId;
    dto.name = group.name;
    dto.description = group.description;
    dto.memberCount = group.members.length;
    dto.createdAt = group.createdAt;
    return dto;
  }
}
