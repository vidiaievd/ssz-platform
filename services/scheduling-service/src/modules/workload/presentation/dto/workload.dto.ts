import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

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
