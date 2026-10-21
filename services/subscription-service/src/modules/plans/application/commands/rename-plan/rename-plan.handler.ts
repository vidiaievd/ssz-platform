import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { loadPlanOr404 } from '../../load-plan.js';
import { toPlanView, type PlanView } from '../../plan-view.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../ports/plan.repository.js';
import { RenamePlanCommand } from './rename-plan.command.js';

/** Display name only — subscribers' entitlements do not change, so no new version. */
@CommandHandler(RenamePlanCommand)
export class RenamePlanHandler implements ICommandHandler<RenamePlanCommand, PlanView> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(command: RenamePlanCommand): Promise<PlanView> {
    const plan = await loadPlanOr404(this.plans, command.code);
    const base = plan.current.version;
    plan.rename(command.name);
    const saved = await this.plans.save(plan, base);
    if (saved.isFail) throw new ConflictException(`Plan "${command.code}" changed meanwhile; reload and retry`);
    return toPlanView(plan);
  }
}
