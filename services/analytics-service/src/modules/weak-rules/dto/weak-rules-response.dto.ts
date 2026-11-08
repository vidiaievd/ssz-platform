import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WeakRuleSourcesDto {
  @ApiProperty({ example: 3, description: 'Model, on a draft before hand-in (rehearsal)' })
  aiPrecheck!: number;

  @ApiProperty({ example: 1, description: 'Model remark on a hand-in that the teacher kept' })
  aiReview!: number;

  @ApiProperty({ example: 2, description: 'The teacher marked the rule themselves' })
  teacher!: number;

  @ApiProperty({ example: 0, description: 'Model, on a reading its voice check closed with no teacher (plan 88)' })
  aiVoice!: number;

  @ApiProperty({ example: 0, description: 'A pronunciation session, on sounds it heard as weak and did not rate (plan 86)' })
  aiSession!: number;
}

export class WeakRuleDto {
  @ApiProperty({ format: 'uuid', description: 'Grammar rule atom id' })
  atomId!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'V2-regelen i hovedsetninger',
    description: 'Atom title as content-service names it; null when it could not be asked or is retired',
  })
  title!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'The grammar rule the atom belongs to' })
  ruleId!: string | null;

  @ApiProperty({ example: 5, description: 'Signals in the window: one per learner, exercise, day and source' })
  flags!: number;

  @ApiProperty({ example: 3, description: 'Distinct learners flagged' })
  learners!: number;

  @ApiProperty({ type: WeakRuleSourcesDto })
  bySource!: WeakRuleSourcesDto;

  @ApiProperty({ example: '2026-11-01T10:15:00.000Z' })
  lastFlaggedAt!: string;
}

export class WeakRulesResponseDto {
  @ApiProperty({ enum: ['7', '30', 'course'] })
  window!: string;

  @ApiProperty({
    nullable: true,
    example: '2026-10-03',
    description: 'First UTC day counted; null for «course» (all days of the course)',
  })
  since!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'The course the signals are narrowed to' })
  courseId!: string | null;

  @ApiProperty({ type: [WeakRuleDto], description: 'Most-flagged first. Empty means no signal, not «no weak rules»' })
  rules!: WeakRuleDto[];
}
