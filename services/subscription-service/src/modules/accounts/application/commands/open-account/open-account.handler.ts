import { randomUUID } from 'node:crypto';
import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { FREE_PLAN_CODES } from '../../../../entitlements/domain/entitlements.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../../plans/application/ports/plan.repository.js';
import { audienceFor, SYSTEM_ACTOR } from '../../../domain/billing-account.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { OpenAccountCommand, type OpenAccountOutcome } from './open-account.command.js';

/**
 * Plan 78 §5: a new payer gets its account and an open-ended subscription to its
 * audience's free plan, so it is pinned to that plan's version like any other subscriber.
 * Idempotent: an account with any history — an admin got there first, or this is a replay
 * — is left as it is.
 */
@CommandHandler(OpenAccountCommand)
export class OpenAccountHandler implements ICommandHandler<OpenAccountCommand, OpenAccountOutcome> {
  private readonly logger = new Logger(OpenAccountHandler.name);

  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
  ) {}

  async execute(command: OpenAccountCommand): Promise<OpenAccountOutcome> {
    const account = await this.accounts.ensure(command.type, command.externalId);
    if (!account.untouched) return 'exists';

    const code = FREE_PLAN_CODES[audienceFor(command.type)];
    const plan = await this.plans.findByCode(code);
    if (!plan) {
      this.logger.error(`Free plan "${code}" is missing — ${command.type} ${command.externalId} opened without a subscription`);
      return 'no_free_plan';
    }

    const assigned = account.assignPlan(plan, {
      subscriptionId: randomUUID(),
      status: 'active',
      periodEnd: null,
      by: SYSTEM_ACTOR,
      now: new Date(),
    });
    if (assigned.isFail) {
      this.logger.error(`Free plan "${code}" not assignable (${assigned.error.code}) — ${command.type} ${command.externalId} opened without a subscription`);
      return 'no_free_plan';
    }

    // A conflict means someone changed the account in between — theirs stands.
    const saved = await this.accounts.save(account);
    return saved.isFail ? 'exists' : 'opened';
  }
}
