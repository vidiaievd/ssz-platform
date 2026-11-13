import { jest } from '@jest/globals';
import type { AdminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import type { PayerPolicy, StoredPayerPolicy } from '../../../domain/payer-policy.js';
import type { BilledPayerType } from '../../../domain/payer.js';
import type { IPayerPolicyRepository } from '../../ports/payer-policy.repository.js';
import { PutPayerPolicyCommand } from './put-payer-policy.command.js';
import { PutPayerPolicyHandler } from './put-payer-policy.handler.js';

const admin = { userId: 'admin-1', level: 'admin' as const };
const schoolId = '6f1c2b0e-8a7d-4c1e-9d0a-1b2c3d4e5f60';

function repository(current: StoredPayerPolicy | null) {
  const save = jest.fn(
    async (payer: { type: BilledPayerType; id: string }, policy: PayerPolicy, audit: AdminAuditEntry): Promise<StoredPayerPolicy> => ({
      payerType: payer.type,
      payerId: payer.id,
      ...policy,
      updatedBy: audit.actor.userId,
      updatedAt: audit.occurredAt,
    }),
  );
  const repo: IPayerPolicyRepository = { get: jest.fn(async () => current), save };
  return { repo, save };
}

describe('PutPayerPolicyHandler (plan 90, phase 3, step 3)', () => {
  it('records the change with the stored policy as before and the new one as after', async () => {
    const { repo, save } = repository({
      payerType: 'workspace',
      payerId: schoolId,
      aiEnabled: true,
      allowedRegions: null,
      updatedBy: 'someone',
      updatedAt: new Date('2026-11-01T00:00:00Z'),
    });
    const saved = await new PutPayerPolicyHandler(repo).execute(
      new PutPayerPolicyCommand('workspace', schoolId, { aiEnabled: true, allowedRegions: ['eu', 'eu', 'local'] }, admin, ' EU only '),
    );

    const [, policy, audit] = save.mock.calls[0]!;
    expect(policy).toEqual({ aiEnabled: true, allowedRegions: ['eu', 'local'] });
    expect(audit).toMatchObject({
      actor: admin,
      action: 'payer_policy.changed',
      targetType: 'workspace',
      targetId: schoolId,
      reason: 'EU only',
      before: { aiEnabled: true, allowedRegions: null },
      after: { aiEnabled: true, allowedRegions: ['eu', 'local'] },
    });
    expect(saved.updatedBy).toBe('admin-1');
  });

  it('leaves before empty when nothing was stored (the default applied)', async () => {
    const { repo, save } = repository(null);
    await new PutPayerPolicyHandler(repo).execute(
      new PutPayerPolicyCommand('user', 'u1', { aiEnabled: false, allowedRegions: null }, admin, 'learner asked'),
    );
    const [, , audit] = save.mock.calls[0]!;
    expect(audit.before).toBeNull();
    expect(audit.after).toEqual({ aiEnabled: false, allowedRegions: null });
    expect(audit.targetType).toBe('user');
  });
});
