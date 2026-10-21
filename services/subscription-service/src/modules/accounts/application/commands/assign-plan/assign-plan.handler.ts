import { randomUUID } from 'node:crypto';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { loadPlanOr404 } from '../../../../plans/application/load-plan.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../../plans/application/ports/plan.repository.js';
import { describeAccountError } from '../../../domain/account-errors.js';
import type { AccountOverview } from '../../account-views.js';
import { ACCOUNT_READER, type IAccountReader } from '../../ports/account.reader.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { AssignPlanCommand } from './assign-plan.command.js';

/**
 * Puts an account on a plan's current version, closing whatever ran before. Creates the
 * account on first sight (until step 5's consumers create them from events).
 */
@CommandHandler(AssignPlanCommand)
export class AssignPlanHandler implements ICommandHandler<AssignPlanCommand, AccountOverview> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(ACCOUNT_READER) private readonly reader: IAccountReader,
  ) {}

  async execute(command: AssignPlanCommand): Promise<AccountOverview> {
    const plan = await loadPlanOr404(this.plans, command.planCode);
    const account = await this.accounts.ensure(command.type, command.externalId);
    const now = new Date();

    const assigned = account.assignPlan(plan, {
      subscriptionId: randomUUID(),
      status: command.status,
      periodEnd: command.periodEnd,
      by: command.actorUserId,
      now,
    });
    if (assigned.isFail) throw businessError(assigned.error, describeAccountError(assigned.error));

    const saved = await this.accounts.save(account);
    if (saved.isFail) throw new ConflictException('The account changed meanwhile; reload and retry');
    return (await this.reader.overview(command.type, command.externalId, now))!;
  }
}
