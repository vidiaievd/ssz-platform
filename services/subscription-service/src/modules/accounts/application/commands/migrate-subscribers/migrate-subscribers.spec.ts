import { Result } from '../../../../../shared/kernel/result.js';
import type { AdminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { Plan, type PlanFeature, type PlanVersion } from '../../../../plans/domain/plan.js';
import type { IPlanRepository } from '../../../../plans/application/ports/plan.repository.js';
import { BillingAccount } from '../../../domain/billing-account.js';
import type { Subscription } from '../../../domain/subscription.js';
import type { IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import type { ISubscriberMigrationReader } from '../../ports/subscriber-migration.reader.js';
import { MigrateSubscribersCommand } from './migrate-subscribers.command.js';
import { MigrateSubscribersHandler, type MigrationBatch, type MigrationPreview } from './migrate-subscribers.handler.js';

const actor = { userId: 'super-1', level: 'super' as const };
const started = new Date('2026-10-10T00:00:00.000Z');
const periodEnd = new Date('2030-01-01T00:00:00.000Z');
const v1: PlanFeature[] = [
  { featureKey: 'ai.review_draft', enabled: true, monthlyCredits: '300', limits: {} },
  { featureKey: 'seats.students', enabled: true, monthlyCredits: null, limits: { max: 30 } },
];
const v2: PlanFeature[] = [
  { featureKey: 'ai.review_draft', enabled: true, monthlyCredits: '500', limits: {} },
  { featureKey: 'seats.students', enabled: true, monthlyCredits: null, limits: { max: 20 } },
];
const version = (n: number, features: PlanFeature[]): PlanVersion => ({ version: n, features, createdBy: 'seed', createdAt: started });

function plan(status: 'active' | 'archived' = 'active', current = 2): Plan {
  return Plan.restore({ id: 'p1', code: 'tutor_pro', name: 'Tutor Pro', audience: 'workspace', status, current: version(current, current === 2 ? v2 : v1) });
}

function sub(accountId: string, planVersion: number, extra: Partial<Subscription> = {}): Subscription {
  return {
    id: `s-${accountId}`,
    accountId,
    planId: 'p1',
    planCode: 'tutor_pro',
    planVersion,
    status: 'active',
    periodStart: started,
    periodEnd,
    createdBy: 'admin-1',
    createdAt: started,
    endedAt: null,
    endedBy: null,
    ...extra,
  };
}

function account(id: string, subscription: Subscription | null): BillingAccount {
  return BillingAccount.restore({
    id,
    type: 'workspace',
    externalId: `school-${id}`,
    createdAt: started,
    revision: 3,
    openSubscriptions: subscription ? [subscription] : [],
  });
}

function setup(opts: { plan?: Plan; accounts?: BillingAccount[]; conflict?: string[]; remaining?: number } = {}) {
  const list = opts.accounts ?? [account('a1', sub('a1', 1)), account('a2', sub('a2', 1))];
  const plans = {
    findByCode: jest.fn().mockResolvedValue(opts.plan ?? plan()),
    versions: jest.fn().mockResolvedValue([version(2, v2), version(1, v1)]),
  };
  const accounts = {
    find: jest.fn((_t: string, externalId: string) => Promise.resolve(list.find((a) => a.externalId === externalId) ?? null)),
    save: jest.fn((a: BillingAccount, _audit?: AdminAuditEntry) =>
      Promise.resolve(opts.conflict?.includes(a.id) ? Result.fail('version_conflict') : Result.ok()),
    ),
  };
  const reader = {
    countByVersion: jest.fn().mockResolvedValue([{ version: 1, subscribers: opts.remaining ?? 2 }]),
    accountsToMove: jest.fn().mockResolvedValue(list.map((a) => ({ type: a.type, externalId: a.externalId }))),
  };
  const handler = new MigrateSubscribersHandler(
    plans as unknown as IPlanRepository,
    accounts as unknown as IBillingAccountRepository,
    reader as unknown as ISubscriberMigrationReader,
  );
  return { handler, plans, accounts, reader };
}

const cmd = (over: Partial<{ toVersion: number; from: number[] | null; dryRun: boolean; reason: string | null; batchId: string | null }> = {}) =>
  new MigrateSubscribersCommand(
    'tutor_pro',
    over.toVersion ?? 2,
    over.from ?? null,
    over.dryRun ?? false,
    actor,
    over.reason === undefined ? 'v2 for everyone' : over.reason,
    over.batchId ?? null,
  );

describe('MigrateSubscribersHandler', () => {
  it('preview: subscribers per source version and what changes key by key; nothing is saved', async () => {
    const t = setup();
    const out = (await t.handler.execute(cmd({ dryRun: true, reason: null }))) as MigrationPreview;
    expect(out).toMatchObject({ dryRun: true, toVersion: 2, total: 2 });
    expect(out.sources).toEqual([
      expect.objectContaining({
        version: 1,
        subscribers: 2,
        changes: [
          expect.objectContaining({ featureKey: 'ai.review_draft', change: 'changed' }),
          expect.objectContaining({ featureKey: 'seats.students', before: expect.objectContaining({ limits: { max: 30 } }) }),
        ],
      }),
    ]);
    expect(t.accounts.save).not.toHaveBeenCalled();
    expect(t.reader.countByVersion.mock.calls[0]![0]).toMatchObject({ planId: 'p1', toVersion: 2, fromVersions: null });
  });

  it('run: each account moves to the current version on the same terms, one trail row each with a shared batchId', async () => {
    const t = setup({ remaining: 0 });
    const out = (await t.handler.execute(cmd())) as MigrationBatch;
    expect(out).toMatchObject({ dryRun: false, moved: 2, skipped: 0, remaining: 0 });

    expect(t.accounts.save).toHaveBeenCalledTimes(2);
    const [saved, audit] = t.accounts.save.mock.calls[0] as unknown as [BillingAccount, AdminAuditEntry];
    const [closed, opened] = saved.changedSubscriptions();
    expect(closed).toMatchObject({ id: 's-a1', status: 'canceled', endedBy: 'super-1' });
    expect(opened).toMatchObject({ planVersion: 2, status: 'active', periodStart: started, periodEnd, createdBy: 'super-1' });
    expect(audit).toMatchObject({
      action: 'subscription.migrated',
      targetType: 'workspace',
      targetId: 'school-a1',
      reason: 'v2 for everyone',
      before: { planVersion: 1, subscriptionId: 's-a1' },
      after: { planVersion: 2, batchId: out.batchId },
    });
    const second = t.accounts.save.mock.calls[1]![1]!;
    expect(second.after).toMatchObject({ batchId: out.batchId });
  });

  it('a later call keeps the run’s batchId', async () => {
    const t = setup();
    const batchId = '0b8f3a2e-5f7c-4c7e-9d2a-1f2e3d4c5b6a';
    const out = (await t.handler.execute(cmd({ batchId }))) as MigrationBatch;
    expect(out.batchId).toBe(batchId);
    expect(t.accounts.save.mock.calls[0]![1]!.after).toMatchObject({ batchId });
  });

  it('an account moved meanwhile or losing the revision race is skipped, not failed', async () => {
    const t = setup({
      accounts: [account('a1', sub('a1', 2)), account('a2', sub('a2', 1)), account('a3', sub('a3', 1))],
      conflict: ['a3'],
      remaining: 1,
    });
    const out = (await t.handler.execute(cmd())) as MigrationBatch;
    expect(out).toMatchObject({ moved: 1, skipped: 2, remaining: 1 });
  });

  it('fromVersions narrows the move: a subscriber of another source version stays', async () => {
    const p3 = Plan.restore({ id: 'p1', code: 'tutor_pro', name: 'Tutor Pro', audience: 'workspace', status: 'active', current: version(3, v2) });
    const t = setup({ plan: p3, accounts: [account('a1', sub('a1', 1)), account('a2', sub('a2', 2))] });
    const out = (await t.handler.execute(cmd({ toVersion: 3, from: [2] }))) as MigrationBatch;
    expect(out).toMatchObject({ moved: 1, skipped: 1 });
    expect(t.reader.accountsToMove.mock.calls[0]![0]).toMatchObject({ fromVersions: [2] });
  });

  it('refusals: not the current version, archived plan, bad source versions, a run without a reason', async () => {
    await expect(setup().handler.execute(cmd({ toVersion: 1 }))).rejects.toMatchObject({
      response: { code: 'migration_target_not_current' },
    });
    await expect(setup({ plan: plan('archived') }).handler.execute(cmd())).rejects.toMatchObject({
      response: { code: 'plan_archived' },
    });
    await expect(setup().handler.execute(cmd({ from: [2] }))).rejects.toMatchObject({
      response: { code: 'invalid_source_versions' },
    });
    const t = setup();
    await expect(t.handler.execute(cmd({ reason: '  ' }))).rejects.toMatchObject({ status: 400 });
    expect(t.accounts.save).not.toHaveBeenCalled();
  });
});

describe('BillingAccount.moveToCurrentVersion', () => {
  const now = new Date('2026-11-15T00:00:00.000Z');
  const move = (a: BillingAccount, p = plan()) => a.moveToCurrentVersion(p, { subscriptionId: 'new', fromVersions: null, by: 'super-1', now });

  it('a trial keeps its status and end', () => {
    const r = move(account('a1', sub('a1', 1, { status: 'trial' })));
    expect(r.value.after).toMatchObject({ status: 'trial', periodEnd, periodStart: started, planVersion: 2 });
  });

  it('refuses a lapsed subscription, another plan, the current version or no subscription', () => {
    expect(move(account('a1', sub('a1', 1, { periodEnd: new Date('2026-11-01T00:00:00.000Z') }))).isFail).toBe(true);
    expect(move(account('a1', sub('a1', 1, { planId: 'other' }))).isFail).toBe(true);
    expect(move(account('a1', sub('a1', 2))).isFail).toBe(true);
    expect(move(account('a1', null)).isFail).toBe(true);
  });
});
