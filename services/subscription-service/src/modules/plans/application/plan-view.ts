import type { Plan, PlanAudience, PlanStatus, PlanVersion } from '../domain/plan.js';

export interface PlanView {
  id: string;
  code: string;
  name: string;
  audience: PlanAudience;
  status: PlanStatus;
  current: PlanVersion;
}

export interface PlanDetailsView extends PlanView {
  /** Every version, newest first. */
  versions: PlanVersion[];
}

export function toPlanView(plan: Plan): PlanView {
  return { id: plan.id, code: plan.code, name: plan.name, audience: plan.audience, status: plan.status, current: plan.current };
}
