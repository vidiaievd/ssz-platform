import { Result } from '../../../../../shared/kernel/result.js';
import { Plan } from '../../../../plans/domain/plan.js';
import type { IPlanRepository } from '../../../../plans/application/ports/plan.repository.js';
import { BillingAccount } from '../../../domain/billing-account.js';
import type { Subscription } from '../../../domain/subscription.js';
import type { IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { OpenAccountCommand } from './open-account.command.js';
import { OpenAccountHandler } from './open-account.handler.js';

const now = new Date('2026-10-21T10:00:00.000Z');
const freeIndividual = Plan.create({ id: 'p1', code: 'free_individual', name: 'Free', audience: 'individual', features: [], createdBy: 'seed', now }).value;

function setup(over: { revision?: number; open?: Subscription[]; plan?: Plan | null; conflict?: boolean } = {}) {
  const account = BillingAccount.restore({
    id: 'acc',
    type: 'user',
    externalId: 'u1',
    createdAt: now,
    revision: over.revision ?? 0,
    openSubscriptions: over.open ?? [],
  });
  const accounts = {
    ensure: jest.fn().mockResolvedValue(account),
    save: jest.fn().mockResolvedValue(over.conflict ? Result.fail('version_conflict') : Result.ok()),
  } as unknown as IBillingAccountRepository;
  const plans = { findByCode: jest.fn().mockResolvedValue(over.plan === undefined ? freeIndividual : over.plan) } as unknown as IPlanRepository;
  return { account, accounts, handler: new OpenAccountHandler(plans, accounts) };
}

describe('OpenAccountHandler', () => {
  it('puts a new account on its audience free plan, open-ended, by the system', async () => {
    const { account, accounts, handler } = setup();
    expect(await handler.execute(new OpenAccountCommand('user', 'u1'))).toBe('opened');
    expect(account.changedSubscriptions()).toEqual([
      expect.objectContaining({ planCode: 'free_individual', status: 'active', periodEnd: null, createdBy: 'system' }),
    ]);
    expect(accounts.save).toHaveBeenCalledTimes(1);
  });

  it('leaves an account with history alone (replay, or an admin was first)', async () => {
    const { accounts, handler } = setup({ revision: 2 });
    expect(await handler.execute(new OpenAccountCommand('user', 'u1'))).toBe('exists');
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('opens the account without a subscription when the free plan is missing or archived', async () => {
    expect(await setup({ plan: null }).handler.execute(new OpenAccountCommand('user', 'u1'))).toBe('no_free_plan');
    const archived = Plan.create({ id: 'p2', code: 'free_individual', name: 'Free', audience: 'individual', features: [], createdBy: 'seed', now }).value;
    archived.archive();
    const { accounts, handler } = setup({ plan: archived });
    expect(await handler.execute(new OpenAccountCommand('user', 'u1'))).toBe('no_free_plan');
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('lets a concurrent change win', async () => {
    expect(await setup({ conflict: true }).handler.execute(new OpenAccountCommand('user', 'u1'))).toBe('exists');
  });
});
