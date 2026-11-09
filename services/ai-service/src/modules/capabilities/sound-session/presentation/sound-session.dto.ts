import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class AdmitSoundSessionRequestDto {
  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: "The school whose `ai.practice` pays; null — the learner's own plan",
  })
  @ValidateIf((o: AdmitSoundSessionRequestDto) => o.schoolId !== null)
  @IsUUID()
  schoolId!: string | null;

  @ApiPropertyOptional({
    default: false,
    description: 'True — a session already begun is reopened: not counted, not refused for the day or the pool; only the budget',
  })
  @IsOptional()
  @IsBoolean()
  resume?: boolean;
}

export class SoundSessionBudgetDto {
  @ApiProperty({ enum: ['school', 'learner'] }) payer!: string;
  @ApiProperty({ description: "False — the payer's `ai.practice` has no monthly allowance" }) metered!: boolean;
  @ApiProperty({ type: String, nullable: true, example: '12.500000', description: 'Credits left this period; null when unmetered or unknown' })
  remainingCredits!: string | null;
  @ApiProperty({ example: '15.000000', description: 'What one session is expected to cost (10 takes and explanations)' })
  estimatedCredits!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time', description: 'When the allowance renews; null when unmetered' })
  periodEnd!: string | null;
}

export class AdmitSoundSessionResponseDto {
  @ApiProperty({ enum: ['admitted', 'refused', 'failed'] }) status!: string;
  @ApiPropertyOptional({ type: SoundSessionBudgetDto, description: 'When admitted' }) budget?: SoundSessionBudgetDto;
  @ApiPropertyOptional({ enum: ['session_limit', 'not_available', 'pool_empty'], description: 'When refused' }) reason?: string;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'On `session_limit`: ms until the next UTC day' })
  retryAfterMs?: number | null;
  @ApiPropertyOptional({ enum: ['gate_unavailable'], description: 'When failed' }) errorCode?: string;
}
