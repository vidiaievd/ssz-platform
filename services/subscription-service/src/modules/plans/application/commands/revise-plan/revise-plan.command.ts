import type { PlanFeature } from '../../../domain/plan.js';

export class RevisePlanCommand {
  constructor(
    readonly code: string,
    readonly features: PlanFeature[],
    /** The version the edit was based on; undefined = whatever is current. */
    readonly expectedVersion: number | undefined,
    readonly actorUserId: string,
  ) {}
}
