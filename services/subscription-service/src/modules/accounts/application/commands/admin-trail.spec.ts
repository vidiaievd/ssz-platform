import { Result } from '../../../../shared/kernel/result.js';
import type { AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import type { IPlanRepository } from '../../../plans/application/ports/plan.repository.js';
import { Plan } from '../../../plans/domain/plan.js';
import { BillingAccount } from '../../domain/billing-account.js';
import { Grant } from '../../domain/grant.js';
import type { Subscription } from '../../domain/subscription.js';
import type { IAccountReader } from '../ports/account.reader.js';
import type { IBillingAccountRepository } from '../ports/billing-account.repository.js';
import type { IGrantRepository } from '../ports/grant.repository.js';
import { AssignPlanCommand } from './assign-plan/assign-plan.command.js';
import { AssignPlanHandler } from './assign-plan/assign-plan.handler.js';
import { CancelSubscriptionCommand } from './cancel-subscription/cancel-subscription.command.js';
import { CancelSubscriptionHandler } from './cancel-subscription/cancel-subscription.handler.js';
import { IssueGrantCommand } from './issue-grant/issue-grant.command.js';
import { IssueGrantHandler } from './issue-grant/issue-grant.handler.js';
import { RevokeGrantCommand } from './revoke-grant/revoke-grant.command.js';
import { RevokeGrantHandler } from './revoke-grant/revoke-grant.handler.js';

const actor = { userId: 'admin-1', level: 'admin' as const };
const created = new Date('2026-10-01T00:00:00.000Z');
const school = Plan.create({ id: 'p-school', code: 'school', name: 'School', audience: 'workspace', features: [], createdBy: 'seed', now: created }).value;

const running: Subscription = {
  id: 'sub-old',
  accountId: 'acc',
  planId: 'p-free',
  planCode: 'free_workspace',
  planVersion: 1,
  status: 'active',
  periodStart: created,
  periodEnd: null,
  createdBy: 'system',
  createdAt: created,
  endedAt: null,
  endedBy: null,
};

function account(open: Subscription[] = []): BillingAccount {
  return BillingAccount.restore({ id: 'acc', type: 'workspace', externalId: 's1', createdAt: created, revision: 3, openSubscriptions: open });
}

function repos(acc: BillingAccount, over: { conflict?: boolean; grant?: Grant } = {}) {
  const accounts = {
    ensure: jest.fn().mockResolvedValue(acc),
    find: jest.fn().mockResolvedValue(acc),
    save: jest.fn().mockResolvedValue(over.conflict ? Result.fail('version_conflict') : Result.ok()),
  };
  const grants = {
    find: jest.fn().mockResolvedValue(over.grant ?? null),
    insert: jest.fn().mockResolvedValue(undefined),
    saveRevocation: jest.fn().mockResolvedValue(Result.ok()),
  };
  const plans = { findByCode: jest.fn().mockResolvedValue(school) };
  const reader = { overview: jest.fn().mockResolvedValue({ account: {}, subscription: null, grants: [] }) };
  return {
    accounts,
    grants,
    plans,
    reader,
    asAccounts: accounts as unknown as IBillingAccountRepository,
    asGrants: grants as unknown as IGrantRepository,
    asPlans: plans as unknown as IPlanRepository,
    asReader: reader as unknown as IAccountReader,
  };
}

function auditOf(mock: jest.Mock, argIndex: number): AdminAuditEntry {
  return mock.mock.calls[0]![argIndex] as AdminAuditEntry;
}

describe('admin trail of account changes', () => {
  it('assign: logs the plan before and after under the payer, in the same save', async () => {
    const r = repos(account([running]));
    await new AssignPlanHandler(r.asPlans, r.asAccounts, r.asReader).execute(
      new AssignPlanCommand('workspace', 's1', 'school', 'active', null, actor, '  contract #12 '),
    );
    const audit = auditOf(r.accounts.save, 1);
    expect(audit).toMatchObject({
      actor,
      action: 'subscription.assigned',
      targetType: 'workspace',
      targetId: 's1',
      reason: 'contract #12',
      before: { subscriptionId: 'sub-old', planCode: 'free_workspace', planVersion: 1, status: 'active' },
      after: { planCode: 'school', planVersion: 1, status: 'active', periodEnd: null },
    });
    expect(audit.id).toEqual(expect.any(String));
  });

  it('assign: an account on its free plan has no before', async () => {
    const r = repos(account());
    await new AssignPlanHandler(r.asPlans, r.asAccounts, r.asReader).execute(
      new AssignPlanCommand('workspace', 's1', 'school', 'active', null, actor, 'contract'),
    );
    expect(auditOf(r.accounts.save, 1).before).toBeNull();
  });

  it('assign: a refused change writes nothing', async () => {
    const r = repos(account());
    await expect(
      new AssignPlanHandler(r.asPlans, r.asAccounts, r.asReader).execute(
        new AssignPlanCommand('workspace', 's1', 'school', 'trial', null, actor, 'trial without end'),
      ),
    ).rejects.toThrow();
    expect(r.accounts.save).not.toHaveBeenCalled();
  });

  it('cancel: logs the canceled subscription as before, nothing after', async () => {
    const r = repos(account([running]));
    await new CancelSubscriptionHandler(r.asAccounts, r.asReader).execute(new CancelSubscriptionCommand('workspace', 's1', actor, 'school closed'));
    expect(auditOf(r.accounts.save, 1)).toMatchObject({
      action: 'subscription.canceled',
      reason: 'school closed',
      before: { subscriptionId: 'sub-old', planCode: 'free_workspace' },
      after: null,
    });
  });

  it('grant issue: the grant reason is the trail reason, the grant is after', async () => {
    const r = repos(account());
    const endsAt = new Date(Date.now() + 30 * 86_400_000);
    await new IssueGrantHandler(r.asAccounts, r.asGrants, r.asReader).execute(
      new IssueGrantCommand(
        'workspace',
        's1',
        { featureKey: 'ai.review_direct', monthlyCredits: '50', limits: {}, startsAt: undefined, endsAt, reason: 'pilot' },
        actor,
      ),
    );
    const [grant, audit] = r.grants.insert.mock.calls[0]! as [Grant, AdminAuditEntry];
    expect(audit).toMatchObject({
      action: 'grant.issued',
      reason: 'pilot',
      before: null,
      after: { grantId: grant.id, featureKey: 'ai.review_direct', monthlyCredits: '50', endsAt: endsAt.toISOString() },
    });
  });

  it('grant revoke: before is the live grant, after its revocation', async () => {
    const grant = Grant.issue({
      id: 'g1',
      accountId: 'acc',
      featureKey: 'ai.review_direct',
      monthlyCredits: null,
      limits: {},
      startsAt: created,
      endsAt: new Date(Date.now() + 86_400_000),
      reason: 'pilot',
      by: 'admin-0',
      now: created,
    }).value;
    const r = repos(account(), { grant });
    await new RevokeGrantHandler(r.asAccounts, r.asGrants, r.asReader).execute(
      new RevokeGrantCommand('workspace', 's1', 'g1', actor, 'pilot ended early'),
    );
    const audit = auditOf(r.grants.saveRevocation, 1);
    expect(audit).toMatchObject({
      action: 'grant.revoked',
      reason: 'pilot ended early',
      before: { grantId: 'g1', featureKey: 'ai.review_direct', monthlyCredits: null },
      after: { grantId: 'g1', revokedAt: expect.any(String) },
    });
    expect(grant.snapshot.revokedBy).toBe('admin-1');
  });
});
