import { ConflictException } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import { BillingAccount } from '../../../domain/billing-account.js';
import type { Subscription } from '../../../domain/subscription.js';
import type { IBillingAccountRepository } from '../../ports/billing-account.repository.js';
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

function setup(over: { account?: BillingAccount | null; conflict?: boolean } = {}) {
  const account =
    over.account === undefined
      ? BillingAccount.restore({ id: 'acc', type: 'workspace', externalId: 'sch1', createdAt: past, revision: 1, openSubscriptions: [subscription] })
      : over.account;
  const accounts = {
    find: jest.fn().mockResolvedValue(account),
    save: jest.fn().mockResolvedValue(over.conflict ? Result.fail('version_conflict') : Result.ok()),
  } as unknown as jest.Mocked<IBillingAccountRepository>;
  return { account, accounts, handler: new CancelSchoolSubscriptionHandler(accounts) };
}

describe('CancelSchoolSubscriptionHandler', () => {
  it('ends the subscription and journals it as `system` with the reason "school closed"', async () => {
    const { account, accounts, handler } = setup();

    expect(await handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).toBe('canceled');

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
    expect(await handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).toBe('nothing_open');
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('throws on a concurrent change so the event is redelivered', async () => {
    const { handler } = setup({ conflict: true });
    await expect(handler.execute(new CancelSchoolSubscriptionCommand('sch1'))).rejects.toBeInstanceOf(ConflictException);
  });
});
