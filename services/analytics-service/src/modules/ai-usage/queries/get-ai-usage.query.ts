import type { AiUsageDimension } from '../domain/usage-aggregate.js';

export class GetAiUsageQuery {
  constructor(
    /** Inclusive, UTC days `YYYY-MM-DD`. */
    public readonly from: string,
    public readonly to: string,
    public readonly groupBy: readonly AiUsageDimension[],
  ) {}
}
