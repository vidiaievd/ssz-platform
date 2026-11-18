import type { AdminUsageGrouping, AdminUsagePayerType } from '../domain/admin-usage.js';

export class GetAdminAiUsageQuery {
  constructor(
    /** Inclusive UTC days `YYYY-MM-DD`. */
    public readonly from: string,
    public readonly to: string,
    public readonly groupBy: AdminUsageGrouping,
    /** null = every payer type. */
    public readonly payerType: AdminUsagePayerType | null,
    /** Top N for `groupBy=payer`; ignored otherwise. */
    public readonly limit: number,
  ) {}
}
