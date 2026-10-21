import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { StoredPayerPolicy } from '../../../domain/payer-policy.js';
import { PAYER_POLICY_REPOSITORY, type IPayerPolicyRepository } from '../../ports/payer-policy.repository.js';
import { PutPayerPolicyCommand } from './put-payer-policy.command.js';

/**
 * Stores a payer's policy. The gate reads it on every call — no cache — so the change holds
 * from the next call on. Regions are de-duplicated; an empty list never reaches here (DTO).
 */
@CommandHandler(PutPayerPolicyCommand)
export class PutPayerPolicyHandler implements ICommandHandler<PutPayerPolicyCommand, StoredPayerPolicy> {
  constructor(@Inject(PAYER_POLICY_REPOSITORY) private readonly policies: IPayerPolicyRepository) {}

  execute({ payerType, payerId, policy, updatedBy }: PutPayerPolicyCommand): Promise<StoredPayerPolicy> {
    const allowedRegions = policy.allowedRegions ? [...new Set(policy.allowedRegions)] : null;
    return this.policies.save({ type: payerType, id: payerId }, { aiEnabled: policy.aiEnabled, allowedRegions }, updatedBy);
  }
}
