import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { describePlanError } from '../../../domain/plan-errors.js';
import { loadPlanOr404 } from '../../load-plan.js';
import { toPlanView, type PlanView } from '../../plan-view.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../ports/plan.repository.js';
import { RevisePlanCommand } from './revise-plan.command.js';

/**
 * New feature list = new version. Existing subscriptions stay on theirs; moving them is a
 * separate, explicit assignment.
 */
@CommandHandler(RevisePlanCommand)
export class RevisePlanHandler implements ICommandHandler<RevisePlanCommand, PlanView> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(command: RevisePlanCommand): Promise<PlanView> {
    const plan = await loadPlanOr404(this.plans, command.code);
    const base = plan.current.version;
    if (command.expectedVersion !== undefined && command.expectedVersion !== base) {
      throw conflict(command.code, command.expectedVersion);
    }
    const revised = plan.revise(command.features, command.actorUserId, new Date());
    if (revised.isFail) throw businessError(revised.error, describePlanError(revised.error));

    const saved = await this.plans.save(plan, base);
    if (saved.isFail) throw conflict(command.code, base);
    return toPlanView(plan);
  }
}

function conflict(code: string, version: number): ConflictException {
  return new ConflictException(`Plan "${code}" changed since version ${version}; reload and retry`);
}
