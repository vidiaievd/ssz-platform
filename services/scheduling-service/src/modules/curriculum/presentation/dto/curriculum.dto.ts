import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsPositive, IsInt, IsEnum, Min } from 'class-validator';

export class UpsertCurriculumDto {
  @ApiProperty({ example: 5 })
  @IsNumber() @IsPositive()
  targetWeeklyHours!: number;
}

export class UnitDto {
  @ApiProperty() title!: string;
  @ApiProperty() order!: number;
  @ApiProperty() plannedSessions!: number;
  @ApiProperty() deliveredSessions!: number;
  @ApiPropertyOptional() requiredLevel!: string | null;
  @ApiProperty({ enum: ['planned', 'active', 'done', 'overridden'] }) status!: string;
}

export class CreateUnitDto {
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsInt() @Min(1) plannedSessions!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredLevel?: string;
}

export class PatchUnitDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) deliveredSessions?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(['planned', 'active', 'done', 'overridden']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() overrideReason?: string;
}

export class ReorderUnitsDto {
  @ApiProperty({ type: [String], description: 'Unit IDs in the desired order' })
  unitIds!: string[];
}

export class LinkLessonUnitDto {
  @ApiProperty() @IsString() curriculumUnitId!: string;
}

export class CurriculumResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() groupId!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() targetWeeklyHours!: number;
  @ApiProperty({ type: [UnitDto] }) units!: UnitDto[];
}
