import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { toPlanView, type PlanView } from '../../plan-view.js';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../ports/plan.repository.js';
import { ListPlansQuery } from './list-plans.query.js';

@QueryHandler(ListPlansQuery)
export class ListPlansHandler implements IQueryHandler<ListPlansQuery, PlanView[]> {
  constructor(@Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository) {}

  async execute(): Promise<PlanView[]> {
    return (await this.plans.list()).map(toPlanView);
  }
}
