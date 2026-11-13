import { randomUUID } from 'node:crypto';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { describePlanError } from '../../../domain/plan-errors.js';
import { Plan } from '../../../domain/plan.js';
import { planVersionSnapshot } from '../../audit-snapshots.js';
import { toPlanView, type PlanView } from '../../plan-view.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../ports/plan.repository.js';
import { CreatePlanCommand } from './create-plan.command.js';

@CommandHandler(CreatePlanCommand)
export class CreatePlanHandler implements ICommandHandler<CreatePlanCommand, PlanView> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(command: CreatePlanCommand): Promise<PlanView> {
    const now = new Date();
    const created = Plan.create({
      id: randomUUID(),
      code: command.code,
      name: command.name,
      audience: command.audience,
      features: command.features,
      createdBy: command.actor.userId,
      now,
    });
    if (created.isFail) throw businessError(created.error, describePlanError(created.error));
    const plan = created.value;

    const audit = adminAuditEntry({
      actor: command.actor,
      action: 'plan.created',
      targetType: 'plan',
      targetId: plan.code,
      reason: command.reason,
      after: { name: plan.name, audience: plan.audience, ...planVersionSnapshot(plan.current) },
      now,
    });
    const saved = await this.plans.create(plan, audit);
    if (saved.isFail) throw new ConflictException(`Plan "${command.code}" already exists`);
    return toPlanView(plan);
  }
}
