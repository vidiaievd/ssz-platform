import { ApiProperty } from '@nestjs/swagger';
import { AI_FEATURE_KEYS } from '../domain/entitlement.js';
import { PayerPolicyResponseDto } from './payer-policy.dto.js';

export class PayerFeatureUsageDto {
  @ApiProperty({ enum: AI_FEATURE_KEYS, example: 'ai.practice' })
  feature!: string;

  @ApiProperty({
    example: true,
    description:
      'The tariff as the gate reads it: plan, grants on top, a disabling grant last. A policy with aiEnabled: false ' +
      'refuses the key anyway (see `policy`)',
  })
  enabled!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '12.350000',
    description:
      'Credits spent this period (six decimals) — the larger of the ledger and the gate counter, as the learner’s own ' +
      'readout counts it. May exceed `total` by the calls in flight when it ran out. Null when the key is off',
  })
  used!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '1000.000000', description: 'Credits per period; null = unmetered, or the key is off' })
  total!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'When the period ends; null when the key is off' })
  periodEnd!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { perLearnerMonthlyCredits: '50' },
    description: 'The key’s limits as resolved (per-learner caps etc.); empty when off',
  })
  limits!: Record<string, unknown>;
}

export class PayerUsageResponseDto {
  @ApiProperty({ enum: ['workspace', 'user'], example: 'workspace' }) payerType!: string;
  @ApiProperty({ example: '6f1c2b0e-8a7d-4c1e-9d0a-1b2c3d4e5f60' }) payerId!: string;

  @ApiProperty({ type: PayerPolicyResponseDto, description: 'The policy in force — stored, or the default (on, any region)' })
  policy!: PayerPolicyResponseDto;

  @ApiProperty({ type: [PayerFeatureUsageDto], description: 'Every AI key, in catalog order, whether the tariff has it or not' })
  features!: PayerFeatureUsageDto[];
}
