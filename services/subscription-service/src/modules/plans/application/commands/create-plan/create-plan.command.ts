import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { PlanAudience, PlanFeature } from '../../../domain/plan.js';

export class CreatePlanCommand {
  constructor(
    readonly code: string,
    readonly name: string,
    readonly audience: PlanAudience,
    readonly features: PlanFeature[],
    readonly actor: AdminActor,
    readonly reason: string,
  ) {}
}
