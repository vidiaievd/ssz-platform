import { ConflictException } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import type { IPlanRepository } from '../../../plans/application/ports/plan.repository.js';
import { Plan } from '../../../plans/domain/plan.js';
import { BillingAccount } from '../../domain/billing-account.js';
import { Grant } from '../../domain/grant.js';
import type { Subscription } from '../../domain/subscription.js';
import { ACCOUNT_CHANGED } from '../account-conflict.js';
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

// Optimistic lock of an admin's account change (plan 90, live check): the panel sends the
// account revision it read; a stale one is 409 `account_changed` and nothing is written.

const actor = { userId: 'admin-1', level: 'admin' as const };
const created = new Date('2026-10-01T00:00:00.000Z');
const REVISION = 3;
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

function account(revision = REVISION, open: Subscription[] = [running]): BillingAccount {
  return BillingAccount.restore({ id: 'acc', type: 'workspace', externalId: 's1', createdAt: created, revision, openSubscriptions: open });
}

function liveGrant(): Grant {
  return Grant.issue({
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
}

function repos(
  acc: BillingAccount,
  over: { saveConflict?: boolean; insertConflict?: boolean; revocation?: 'version_conflict' | 'account_changed'; grant?: Grant } = {},
) {
  const accounts = {
    ensure: jest.fn().mockResolvedValue(acc),
    find: jest.fn().mockResolvedValue(acc),
    save: jest.fn().mockResolvedValue(over.saveConflict ? Result.fail('version_conflict') : Result.ok()),
  };
  const grants = {
    find: jest.fn().mockResolvedValue(over.grant ?? liveGrant()),
    insert: jest.fn().mockResolvedValue(over.insertConflict ? Result.fail('account_changed') : Result.ok()),
    saveRevocation: jest.fn().mockResolvedValue(over.revocation ? Result.fail(over.revocation) : Result.ok()),
  };
  const plans = { findByCode: jest.fn().mockResolvedValue(school) };
  const reader = { overview: jest.fn().mockResolvedValue({ account: {}, subscription: null, grants: [] }) };
  return {
    accounts,
    grants,
    assign: new AssignPlanHandler(plans as unknown as IPlanRepository, accounts as unknown as IBillingAccountRepository, reader as unknown as IAccountReader),
    cancel: new CancelSubscriptionHandler(accounts as unknown as IBillingAccountRepository, reader as unknown as IAccountReader),
    issue: new IssueGrantHandler(
      accounts as unknown as IBillingAccountRepository,
      grants as unknown as IGrantRepository,
      reader as unknown as IAccountReader,
    ),
    revoke: new RevokeGrantHandler(
      accounts as unknown as IBillingAccountRepository,
      grants as unknown as IGrantRepository,
      reader as unknown as IAccountReader,
    ),
  };
}

const assignCmd = (expected?: number) => new AssignPlanCommand('workspace', 's1', 'school', 'active', null, actor, 'contract', expected);
const cancelCmd = (expected?: number) => new CancelSubscriptionCommand('workspace', 's1', actor, 'closed', expected);
const issueCmd = (expected?: number) =>
  new IssueGrantCommand(
    'workspace',
    's1',
    {
      featureKey: 'ai.review_direct',
      enabled: true,
      monthlyCredits: '50',
      limits: {},
      startsAt: undefined,
      endsAt: new Date(Date.now() + 30 * 86_400_000),
      reason: 'pilot',
    },
    actor,
    expected,
  );
const revokeCmd = (expected?: number) => new RevokeGrantCommand('workspace', 's1', 'g1', actor, 'pilot over', expected);

/** Runs `fn`, expecting a 409 `account_changed`; returns its body. */
async function conflictOf(fn: () => Promise<unknown>): Promise<Record<string, unknown>> {
  const err = await fn().then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ConflictException);
  const body = (err as ConflictException).getResponse() as Record<string, unknown>;
  expect(body).toMatchObject({ statusCode: 409, code: ACCOUNT_CHANGED });
  return body;
}

describe('expectedRevision on admin account changes', () => {
  describe('assign plan', () => {
    it('a stale revision is 409 account_changed with both revisions, nothing saved', async () => {
      const r = repos(account());
      const body = await conflictOf(() => r.assign.execute(assignCmd(REVISION - 1)));
      expect(body.details).toEqual({ code: ACCOUNT_CHANGED, expectedRevision: REVISION - 1, revision: REVISION });
      expect(r.accounts.save).not.toHaveBeenCalled();
    });

    it('the revision read goes through', async () => {
      const r = repos(account());
      await r.assign.execute(assignCmd(REVISION));
      expect(r.accounts.save).toHaveBeenCalledTimes(1);
    });

    it('without expectedRevision there is no check (old callers, scripts)', async () => {
      const r = repos(account(REVISION + 10));
      await r.assign.execute(assignCmd());
      expect(r.accounts.save).toHaveBeenCalledTimes(1);
    });

    it('a payer never seen is at revision 0: the panel sends 0 after a 404', async () => {
      const r = repos(account(0, []));
      await r.assign.execute(assignCmd(0));
      expect(r.accounts.save).toHaveBeenCalledTimes(1);
    });

    it('losing the save race is the same 409 code', async () => {
      const r = repos(account(), { saveConflict: true });
      const body = await conflictOf(() => r.assign.execute(assignCmd(REVISION)));
      expect(body.details).toEqual({ code: ACCOUNT_CHANGED, expectedRevision: REVISION });
    });
  });

  describe('cancel subscription', () => {
    it('a stale revision is 409, nothing saved', async () => {
      const r = repos(account());
      await conflictOf(() => r.cancel.execute(cancelCmd(REVISION + 1)));
      expect(r.accounts.save).not.toHaveBeenCalled();
    });

    it('the revision read goes through', async () => {
      const r = repos(account());
      await r.cancel.execute(cancelCmd(REVISION));
      expect(r.accounts.save).toHaveBeenCalledTimes(1);
    });

    it('without expectedRevision there is no check', async () => {
      const r = repos(account(REVISION + 10));
      await r.cancel.execute(cancelCmd());
      expect(r.accounts.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('issue grant', () => {
    it('a stale revision is 409, nothing inserted', async () => {
      const r = repos(account());
      await conflictOf(() => r.issue.execute(issueCmd(REVISION - 1)));
      expect(r.grants.insert).not.toHaveBeenCalled();
    });

    it('the revision read is claimed in the insert, so a writer in between still loses', async () => {
      const r = repos(account());
      await r.issue.execute(issueCmd(REVISION));
      expect(r.grants.insert).toHaveBeenCalledWith(expect.any(Grant), expect.anything(), REVISION);
    });

    it('a lost claim is 409', async () => {
      const r = repos(account(), { insertConflict: true });
      await conflictOf(() => r.issue.execute(issueCmd(REVISION)));
    });

    it('without expectedRevision nothing is claimed: grants issued at once both stand', async () => {
      const r = repos(account(REVISION + 10));
      await r.issue.execute(issueCmd());
      expect(r.grants.insert).toHaveBeenCalledWith(expect.any(Grant), expect.anything(), undefined);
    });
  });

  describe('revoke grant', () => {
    it('a stale revision is 409 even for a grant already revoked (not 422)', async () => {
      const revoked = liveGrant();
      revoked.revoke('admin-2', new Date());
      const r = repos(account(), { grant: revoked });
      await conflictOf(() => r.revoke.execute(revokeCmd(REVISION - 1)));
      expect(r.grants.saveRevocation).not.toHaveBeenCalled();
    });

    it('the revision read is claimed in the revocation', async () => {
      const r = repos(account());
      await r.revoke.execute(revokeCmd(REVISION));
      expect(r.grants.saveRevocation).toHaveBeenCalledWith(expect.any(Grant), expect.anything(), REVISION);
    });

    it('a lost claim is 409 account_changed', async () => {
      const r = repos(account(), { revocation: 'account_changed' });
      await conflictOf(() => r.revoke.execute(revokeCmd(REVISION)));
    });

    it('without expectedRevision: nothing claimed, a concurrent revocation keeps its old 409', async () => {
      const r = repos(account(REVISION + 10), { revocation: 'version_conflict' });
      const err = await r.revoke.execute(revokeCmd()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).not.toMatchObject({ code: ACCOUNT_CHANGED });
      expect(r.grants.saveRevocation).toHaveBeenCalledWith(expect.any(Grant), expect.anything(), undefined);
    });
  });
});
