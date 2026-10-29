import { ConflictException } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import { BillingAccount } from '../../../domain/billing-account.js';
import { Grant } from '../../../domain/grant.js';
import type { Subscription } from '../../../domain/subscription.js';
import type { IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import type { IGrantRepository } from '../../ports/grant.repository.js';
import { CloseUserAccountCommand } from './close-user-account.command.js';
import { CloseUserAccountHandler } from './close-user-account.handler.js';

const past = new Date('2026-09-01T00:00:00.000Z');
const future = new Date('2099-01-01T00:00:00.000Z');

const subscription: Subscription = {
  id: 's1',
  accountId: 'acc',
  planId: 'p1',
  planCode: 'free_individual',
  planVersion: 1,
  status: 'active',
  periodStart: past,
  periodEnd: null,
  createdBy: 'system',
  createdAt: past,
  endedAt: null,
  endedBy: null,
};

const grant = () =>
  Grant.restore({
    id: 'g1',
    accountId: 'acc',
    featureKey: 'ai.student_assist',
    monthlyCredits: null,
    limits: {},
    startsAt: past,
    endsAt: future,
    reason: 'pilot',
    createdBy: 'admin',
    createdAt: past,
    revokedAt: null,
    revokedBy: null,
  });

function setup(over: { account?: BillingAccount | null; grants?: Grant[]; conflict?: boolean } = {}) {
  const account =
    over.account === undefined
      ? BillingAccount.restore({ id: 'acc', type: 'user', externalId: 'u1', createdAt: past, revision: 1, openSubscriptions: [subscription] })
      : over.account;
  const accounts = {
    find: jest.fn().mockResolvedValue(account),
    save: jest.fn().mockResolvedValue(over.conflict ? Result.fail('version_conflict') : Result.ok()),
  } as unknown as jest.Mocked<IBillingAccountRepository>;
  const grants = {
    listLive: jest.fn().mockResolvedValue(over.grants ?? []),
    saveRevocation: jest.fn().mockResolvedValue(Result.ok()),
  } as unknown as jest.Mocked<IGrantRepository>;
  return { account, accounts, grants, handler: new CloseUserAccountHandler(accounts, grants) };
}

describe('CloseUserAccountHandler', () => {
  it('closes the subscription and revokes live grants, keeping the rows', async () => {
    const g = grant();
    const { account, accounts, grants, handler } = setup({ grants: [g] });

    expect(await handler.execute(new CloseUserAccountCommand('u1'))).toBe('closed');

    expect(accounts.find).toHaveBeenCalledWith('user', 'u1');
    expect(account!.changedSubscriptions()).toEqual([expect.objectContaining({ id: 's1', endedBy: 'system' })]);
    expect(accounts.save).toHaveBeenCalledTimes(1);
    expect(g.snapshot.revokedBy).toBe('system');
    expect(grants.saveRevocation).toHaveBeenCalledWith(g);
    // Account first: a revocation bumps the revision the save checks.
    expect(accounts.save.mock.invocationCallOrder[0]).toBeLessThan(grants.saveRevocation.mock.invocationCallOrder[0]!);
  });

  it('does nothing for a payer never seen', async () => {
    const { grants, handler } = setup({ account: null });
    expect(await handler.execute(new CloseUserAccountCommand('u1'))).toBe('no_account');
    expect(grants.listLive).not.toHaveBeenCalled();
  });

  it('is a no-op on a replay', async () => {
    const empty = BillingAccount.restore({ id: 'acc', type: 'user', externalId: 'u1', createdAt: past, revision: 2, openSubscriptions: [] });
    const { accounts, handler } = setup({ account: empty });
    expect(await handler.execute(new CloseUserAccountCommand('u1'))).toBe('nothing_open');
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('throws on a concurrent change so the event is redelivered', async () => {
    const { grants, handler } = setup({ conflict: true, grants: [grant()] });
    await expect(handler.execute(new CloseUserAccountCommand('u1'))).rejects.toBeInstanceOf(ConflictException);
    expect(grants.saveRevocation).not.toHaveBeenCalled();
  });
});
