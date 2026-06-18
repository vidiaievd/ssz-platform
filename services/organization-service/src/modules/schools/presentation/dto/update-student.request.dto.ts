import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export class UpdateStudentRequestDto {
  @ApiPropertyOptional({ enum: ['active', 'archived'] })
  @IsOptional()
  @IsEnum(['active', 'archived'])
  status?: 'active' | 'archived';

  @ApiPropertyOptional({ enum: CEFR_LEVELS, example: 'B1' })
  @IsOptional()
  @IsString()
  @Matches(/^(A1|A2|B1|B2|C1|C2)$/)
  level?: string;
}
