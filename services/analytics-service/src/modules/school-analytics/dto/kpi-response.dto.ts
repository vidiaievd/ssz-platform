import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KpiDto {
  @ApiProperty({ example: 'active_students_7d' })
  key!: string;

  @ApiProperty({ example: 'Active students · 7d' })
  label!: string;

  @ApiProperty({ example: 412 })
  value!: number;

  @ApiPropertyOptional({ example: '+18' })
  delta?: string | null;

  @ApiPropertyOptional({ enum: ['up', 'down', 'flat'] })
  trend?: 'up' | 'down' | 'flat' | null;

  @ApiPropertyOptional({ example: 'of 487 enrolled' })
  hint?: string;

  @ApiPropertyOptional({ type: [Number], example: [35, 42, 38, 55, 48, 62, 70] })
  spark?: number[];

  @ApiPropertyOptional({ example: 'oldest: 18 hours' })
  sub?: string;
}

export class GetKpisResponseDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'TEACHER', 'CONTENT_ADMIN'] })
  role!: string;

  @ApiProperty({ type: [KpiDto] })
  kpis!: KpiDto[];
}
