import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsNumber, IsOptional, IsPositive, IsInt, IsEnum, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertUnitDto {
  /**
   * Existing unit to update in place. Omit to create a new one. Units are
   * matched by id rather than replaced wholesale so that lessons already taught
   * against a unit keep pointing at it — recreating units would cut those links
   * and silently zero the group's progress.
   */
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsInt() @Min(1) plannedSessions!: number;
  /** Unit of the linked course this plan unit teaches; null leaves it unstitched. */
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() contentUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() requiredLevel?: string;
  @ApiPropertyOptional({ enum: ['planned', 'active', 'done', 'overridden'] })
  @IsOptional() @IsEnum(['planned', 'active', 'done', 'overridden'])
  status?: string;
}

export class UpsertCurriculumDto {
  @ApiProperty({ example: 5 })
  @IsNumber() @IsPositive()
  targetWeeklyHours!: number;

  @ApiPropertyOptional({
    type: [UpsertUnitDto],
    description: 'When present, replaces the full unit list (order = array order)',
  })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpsertUnitDto)
  units?: UpsertUnitDto[];
}

export class UnitDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() order!: number;
  @ApiProperty() plannedSessions!: number;
  @ApiProperty({ description: 'Lessons marked held against this unit. Counted, never typed in.' })
  deliveredSessions!: number;
  @ApiPropertyOptional({ nullable: true }) contentUnitId!: string | null;
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
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() contentUnitId?: string | null;
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
