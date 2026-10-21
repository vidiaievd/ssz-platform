import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { loadPlanOr404 } from '../../load-plan.js';
import { toPlanView, type PlanDetailsView } from '../../plan-view.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../ports/plan.repository.js';
import { GetPlanQuery } from './get-plan.query.js';

@QueryHandler(GetPlanQuery)
export class GetPlanHandler implements IQueryHandler<GetPlanQuery, PlanDetailsView> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(query: GetPlanQuery): Promise<PlanDetailsView> {
    const plan = await loadPlanOr404(this.plans, query.code);
    return { ...toPlanView(plan), versions: await this.plans.versions(query.code) };
  }
}
