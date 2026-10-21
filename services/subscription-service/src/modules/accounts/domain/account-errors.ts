import { describePlanError, type PlanError } from '../../plans/domain/plan-errors.js';

/**
 * Business refusals around accounts, subscriptions and grants — all 422 at the edge. Plan
 * errors pass through unchanged: an archived plan or a bad key in a grant reads the same
 * here as in the plan API.
 */
export type AccountError =
  | PlanError
  | { code: 'audience_mismatch'; planCode: string; audience: string; accountType: string }
  | { code: 'trial_needs_period_end' }
  | { code: 'period_end_in_past' }
  | { code: 'no_current_subscription' }
  | { code: 'grant_reason_required' }
  | { code: 'invalid_grant_period' }
  | { code: 'grant_already_revoked'; grantId: string }
  | { code: 'grant_ended'; grantId: string };

export function describeAccountError(error: AccountError): string {
  switch (error.code) {
    case 'audience_mismatch':
      return `Plan "${error.planCode}" is for ${error.audience} accounts, not ${error.accountType}`;
    case 'trial_needs_period_end':
      return 'A trial needs periodEnd';
    case 'period_end_in_past':
      return 'periodEnd must be in the future';
    case 'no_current_subscription':
      return 'The account has no current subscription';
    case 'grant_reason_required':
      return 'A grant needs a reason';
    case 'invalid_grant_period':
      return 'endsAt must be after startsAt and in the future';
    case 'grant_already_revoked':
      return `Grant ${error.grantId} is already revoked`;
    case 'grant_ended':
      return `Grant ${error.grantId} has already ended`;
    default:
      return describePlanError(error);
  }
}
