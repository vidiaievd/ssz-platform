import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { AiRegion } from '../../../../registry/domain/registry.types.js';
import { DEFAULT_POLICY } from '../../../domain/payer-policy.js';
import type { BilledPayerType } from '../../../domain/payer.js';
import { PAYER_POLICY_REPOSITORY, type IPayerPolicyRepository } from '../../ports/payer-policy.repository.js';
import { GetPayerPolicyQuery } from './get-payer-policy.query.js';

/** The policy the gate applies to this payer: the stored one, or the default. */
export interface EffectivePayerPolicy {
  payerType: BilledPayerType;
  payerId: string;
  aiEnabled: boolean;
  allowedRegions: AiRegion[] | null;
  /** False when nothing is stored and the default applies. */
  stored: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
}

@QueryHandler(GetPayerPolicyQuery)
export class GetPayerPolicyHandler implements IQueryHandler<GetPayerPolicyQuery, EffectivePayerPolicy> {
  constructor(@Inject(PAYER_POLICY_REPOSITORY) private readonly policies: IPayerPolicyRepository) {}

  async execute({ payerType, payerId }: GetPayerPolicyQuery): Promise<EffectivePayerPolicy> {
    const stored = await this.policies.get({ type: payerType, id: payerId });
    if (stored) return { ...stored, stored: true };
    return { payerType, payerId, ...DEFAULT_POLICY, stored: false, updatedBy: null, updatedAt: null };
  }
}
