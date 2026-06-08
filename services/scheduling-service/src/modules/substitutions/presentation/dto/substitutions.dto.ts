import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsDateString, IsUUID } from 'class-validator';

export class CreateSubRequestDto {
  @ApiProperty() @IsUUID() lessonId!: string;
  @ApiPropertyOptional() @IsUUID() absenceId?: string;
  @ApiProperty() @IsDateString() coverFrom!: string;
  @ApiProperty() @IsDateString() coverTo!: string;
}

export class AssignSubstituteDto {
  @ApiProperty() @IsString() substituteTeacherId!: string;
}

export class SubRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() lessonId!: string;
  @ApiPropertyOptional() absenceId!: string | null;
  @ApiProperty() groupId!: string;
  @ApiProperty() originalTeacherId!: string;
  @ApiProperty() coverFrom!: string;
  @ApiProperty() coverTo!: string;
  @ApiProperty() urgency!: string;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: string;
}

export class CandidateDto {
  @ApiProperty() teacherId!: string;
  @ApiProperty() eligible!: boolean;
  @ApiProperty() fitScore!: number;
  @ApiProperty({ type: [String] }) reasons!: string[];
}

export class AssignmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty() substituteTeacherId!: string;
  @ApiProperty() originalTeacherId!: string;
  @ApiProperty() fitScore!: number;
  @ApiProperty() status!: string;
}
