import { NotFoundException } from '@nestjs/common';
import type { Plan } from '../domain/plan.js';
import type { IPlanRepository } from './ports/plan.repository.js';

export async function loadPlanOr404(plans: IPlanRepository, code: string): Promise<Plan> {
  const plan = await plans.findByCode(code);
  if (!plan) throw new NotFoundException(`Plan "${code}" not found`);
  return plan;
}
