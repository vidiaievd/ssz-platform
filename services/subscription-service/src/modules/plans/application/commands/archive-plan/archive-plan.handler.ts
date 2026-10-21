import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { describePlanError } from '../../../domain/plan-errors.js';
import { loadPlanOr404 } from '../../load-plan.js';
import { toPlanView, type PlanView } from '../../plan-view.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../ports/plan.repository.js';
import { ArchivePlanCommand } from './archive-plan.command.js';

/** Stops new assignments; accounts already on the plan keep their version. */
@CommandHandler(ArchivePlanCommand)
export class ArchivePlanHandler implements ICommandHandler<ArchivePlanCommand, PlanView> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(command: ArchivePlanCommand): Promise<PlanView> {
    const plan = await loadPlanOr404(this.plans, command.code);
    const base = plan.current.version;
    const archived = plan.archive();
    if (archived.isFail) throw businessError(archived.error, describePlanError(archived.error));
    const saved = await this.plans.save(plan, base);
    if (saved.isFail) throw new ConflictException(`Plan "${command.code}" changed meanwhile; reload and retry`);
    return toPlanView(plan);
  }
}
