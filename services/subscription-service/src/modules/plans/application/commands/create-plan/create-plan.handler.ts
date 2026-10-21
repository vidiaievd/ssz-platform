import { randomUUID } from 'node:crypto';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { describePlanError } from '../../../domain/plan-errors.js';
import { Plan } from '../../../domain/plan.js';
import { toPlanView, type PlanView } from '../../plan-view.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../ports/plan.repository.js';
import { CreatePlanCommand } from './create-plan.command.js';

@CommandHandler(CreatePlanCommand)
export class CreatePlanHandler implements ICommandHandler<CreatePlanCommand, PlanView> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(command: CreatePlanCommand): Promise<PlanView> {
    const created = Plan.create({
      id: randomUUID(),
      code: command.code,
      name: command.name,
      audience: command.audience,
      features: command.features,
      createdBy: command.actorUserId,
      now: new Date(),
    });
    if (created.isFail) throw businessError(created.error, describePlanError(created.error));

    const saved = await this.plans.create(created.value);
    if (saved.isFail) throw new ConflictException(`Plan "${command.code}" already exists`);
    return toPlanView(created.value);
  }
}
