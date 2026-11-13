import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import type { PayerPolicy, StoredPayerPolicy } from '../../../domain/payer-policy.js';
import { PAYER_POLICY_REPOSITORY, type IPayerPolicyRepository } from '../../ports/payer-policy.repository.js';
import { PutPayerPolicyCommand } from './put-payer-policy.command.js';

/**
 * Stores a payer's policy and puts the change on the admin trail (`payer_policy.changed`, plan 90,
 * phase 3, step 3). The gate reads the policy on every call — no cache — so the change holds from
 * the next call on. Regions are de-duplicated; an empty list never reaches here (DTO). A write that
 * changes nothing is still recorded: the admin stated a reason for it.
 */
@CommandHandler(PutPayerPolicyCommand)
export class PutPayerPolicyHandler implements ICommandHandler<PutPayerPolicyCommand, StoredPayerPolicy> {
  constructor(@Inject(PAYER_POLICY_REPOSITORY) private readonly policies: IPayerPolicyRepository) {}

  async execute({ payerType, payerId, policy, admin, reason }: PutPayerPolicyCommand): Promise<StoredPayerPolicy> {
    const payer = { type: payerType, id: payerId };
    const allowedRegions = policy.allowedRegions ? [...new Set(policy.allowedRegions)] : null;
    const next: PayerPolicy = { aiEnabled: policy.aiEnabled, allowedRegions };

    const current = await this.policies.get(payer);
    const audit = adminAuditEntry({
      actor: admin,
      action: 'payer_policy.changed',
      targetType: payerType,
      targetId: payerId,
      reason,
      before: current ? sides(current) : null,
      after: sides(next),
      now: new Date(),
    });
    return this.policies.save(payer, next, audit);
  }
}

function sides(policy: PayerPolicy): Record<string, unknown> {
  return { aiEnabled: policy.aiEnabled, allowedRegions: policy.allowedRegions };
}
