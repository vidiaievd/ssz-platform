import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsDateString, IsOptional } from 'class-validator';

export class CreateAbsenceDto {
  @ApiProperty({ enum: ['sick', 'leave', 'vacancy'] })
  @IsEnum(['sick', 'leave', 'vacancy'])
  kind!: string;

  @ApiProperty({ enum: ['today', 'window', 'permanent'] })
  @IsEnum(['today', 'window', 'permanent'])
  scope!: string;

  @ApiProperty({ example: '2026-06-10' })
  @IsDateString()
  fromDate!: string;

  @ApiPropertyOptional({ example: '2026-06-14' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiProperty({ example: 'Sick leave' })
  @IsString()
  reason!: string;
}

export class AbsenceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() teacherId!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() scope!: string;
  @ApiProperty() fromDate!: string;
  @ApiPropertyOptional() toDate!: string | null;
  @ApiProperty() reason!: string;
  @ApiProperty() createdBy!: string;
  @ApiProperty() createdAt!: string;
}
