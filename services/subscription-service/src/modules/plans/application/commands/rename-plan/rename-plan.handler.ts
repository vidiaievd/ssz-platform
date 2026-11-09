import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { loadPlanOr404 } from '../../load-plan.js';
import { toPlanView, type PlanView } from '../../plan-view.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../ports/plan.repository.js';
import { RenamePlanCommand } from './rename-plan.command.js';

/**
 * Display name only — subscribers' entitlements do not change, so no new version. The same
 * name again changes nothing and leaves no trail.
 */
@CommandHandler(RenamePlanCommand)
export class RenamePlanHandler implements ICommandHandler<RenamePlanCommand, PlanView> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(command: RenamePlanCommand): Promise<PlanView> {
    const plan = await loadPlanOr404(this.plans, command.code);
    const before = plan.name;
    if (command.name === before) return toPlanView(plan);
    const base = plan.current.version;
    plan.rename(command.name);

    const audit = adminAuditEntry({
      actor: command.actor,
      action: 'plan.renamed',
      targetType: 'plan',
      targetId: plan.code,
      reason: command.reason,
      before: { name: before },
      after: { name: plan.name },
      now: new Date(),
    });
    const saved = await this.plans.save(plan, base, audit);
    if (saved.isFail) throw new ConflictException(`Plan "${command.code}" changed meanwhile; reload and retry`);
    return toPlanView(plan);
  }
}
