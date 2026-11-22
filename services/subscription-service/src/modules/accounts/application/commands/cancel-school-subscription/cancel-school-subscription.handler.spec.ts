import { ConflictException } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import { BillingAccount } from '../../../domain/billing-account.js';
import { Grant } from '../../../domain/grant.js';
import type { Subscription } from '../../../domain/subscription.js';
import type { IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import type { IGrantRepository } from '../../ports/grant.repository.js';
import { CancelSchoolSubscriptionCommand } from './cancel-school-subscription.command.js';
import { CancelSchoolSubscriptionHandler } from './cancel-school-subscription.handler.js';

const past = new Date('2026-09-01T00:00:00.000Z');

const subscription: Subscription = {
  id: 's1',
  accountId: 'acc',
  planId: 'p1',
  planCode: 'school',
  planVersion: 2,
  status: 'active',
  periodStart: past,
  periodEnd: null,
  createdBy: 'admin',
  createdAt: past,
  endedAt: null,
  endedBy: null,
};

function grant(id: string, startsAt: Date, endsAt: Date): Grant {
  return Grant.restore({
    id,
    accountId: 'acc',
    featureKey: 'ai.review_draft',
    enabled: true,
    monthlyCredits: '100',
    limits: {},
    startsAt,
    endsAt,
    reason: 'pilot',
    createdBy: 'admin-1',
    createdAt: past,
    revokedAt: null,
    revokedBy: null,
  });
}

function setup(
  over: { account?: BillingAccount | null; conflict?: boolean; live?: Grant[]; revokeConflict?: string[] } = {},
) {
  const account =
    over.account === undefined
      ? BillingAccount.restore({ id: 'acc', type: 'workspace', externalId: 'sch1', createdAt: past, revision: 1, openSubscriptions: [subscription] })
      : over.account;
  const accounts = {
    find: jest.fn().mockResolvedValue(account),
    save: jest.fn().mockResolvedValue(over.conflict ? Result.fail('version_conflict') : Result.ok()),
  } as unknown as jest.Mocked<IBillingAccountRepository>;
  const grants = {
    listLive: jest.fn().mockResolvedValue(over.live ?? []),
    saveRevocation: jest.fn((g: Grant) =>
      Promise.resolve(over.revokeConflict?.includes(g.id) ? Result.fail('version_conflict') : Result.ok()),
    ),
  } as unknown as jest.Mocked<IGrantRepository>;
  return { account, accounts, grants, handler: new CancelSchoolSubscriptionHandler(accounts, grants) };
}

describe('CancelSchoolSubscriptionHandler', () => {
  it('ends the subscription and journals it as `system` with the reason "school closed"', async () => {
    const { account, accounts, handler } = setup();

    expect(await handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).toEqual({ subscription: 'canceled', grantsRevoked: 0 });

    expect(accounts.find).toHaveBeenCalledWith('workspace', 'sch1');
    expect(account!.changedSubscriptions()).toEqual([expect.objectContaining({ id: 's1', endedBy: 'system' })]);
    const audit = accounts.save.mock.calls[0]![1]!;
    expect(audit).toMatchObject({
      actor: { userId: 'system', level: 'system' },
      action: 'subscription.canceled',
      targetType: 'workspace',
      targetId: 'sch1',
      reason: 'school closed',
    });
    expect(audit.before).toMatchObject({ planCode: 'school' });
  });

  it('does nothing for a school never seen', async () => {
    const { accounts, handler } = setup({ account: null });
    expect(await handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).toBe('no_account');
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('writes nothing when no subscription is open (a replay, or a school on the free plan)', async () => {
    const empty = BillingAccount.restore({ id: 'acc', type: 'workspace', externalId: 'sch1', createdAt: past, revision: 2, openSubscriptions: [] });
    const { accounts, handler } = setup({ account: empty });
    expect(await handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).toEqual({
      subscription: 'nothing_open',
      grantsRevoked: 0,
    });
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('throws on a concurrent change so the event is redelivered', async () => {
    const { handler } = setup({ conflict: true });
    await expect(handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes every live grant, running or scheduled, each journalled as `system`', async () => {
    const now = Date.now();
    const running = grant('g1', past, new Date(now + 30 * 86_400_000));
    const scheduled = grant('g2', new Date(now + 86_400_000), new Date(now + 60 * 86_400_000));
    const { grants, handler } = setup({ live: [running, scheduled] });

    expect(await handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).toEqual({
      subscription: 'canceled',
      grantsRevoked: 2,
    });

    expect(grants.listLive).toHaveBeenCalledWith('acc', expect.any(Date));
    expect(grants.saveRevocation).toHaveBeenCalledTimes(2);
    const [revoked, audit] = grants.saveRevocation.mock.calls[0]!;
    expect(revoked.snapshot).toMatchObject({ id: 'g1', revokedBy: 'system' });
    expect(revoked.snapshot.revokedAt).toBeInstanceOf(Date);
    expect(audit).toMatchObject({
      actor: { userId: 'system', level: 'system' },
      action: 'grant.revoked',
      targetType: 'workspace',
      targetId: 'sch1',
      reason: 'school closed',
      before: { grantId: 'g1', featureKey: 'ai.review_draft', monthlyCredits: '100' },
      after: { grantId: 'g1' },
    });
  });

  it('revokes the grants of a school on the free plan too', async () => {
    const empty = BillingAccount.restore({ id: 'acc', type: 'workspace', externalId: 'sch1', createdAt: past, revision: 2, openSubscriptions: [] });
    const { accounts, handler } = setup({
      account: empty,
      live: [grant('g1', past, new Date(Date.now() + 86_400_000))],
    });
    expect(await handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).toEqual({
      subscription: 'nothing_open',
      grantsRevoked: 1,
    });
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('does not count a grant an admin revoked meanwhile', async () => {
    const { handler } = setup({
      live: [grant('g1', past, new Date(Date.now() + 86_400_000)), grant('g2', past, new Date(Date.now() + 86_400_000))],
      revokeConflict: ['g1'],
    });
    expect(await handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).toEqual({
      subscription: 'canceled',
      grantsRevoked: 1,
    });
  });

  it('touches no grant when the subscription save conflicts (the redelivery does it)', async () => {
    const { grants, handler } = setup({ conflict: true, live: [grant('g1', past, new Date(Date.now() + 86_400_000))] });
    await expect(handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).rejects.toBeInstanceOf(ConflictException);
    expect(grants.saveRevocation).not.toHaveBeenCalled();
  });
});
