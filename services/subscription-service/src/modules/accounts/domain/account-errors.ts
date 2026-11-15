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
  | { code: 'grant_disable_with_allowance'; featureKey: string }
  | { code: 'grant_disable_not_applicable'; featureKey: string }
  | { code: 'grant_already_revoked'; grantId: string }
  | { code: 'grant_ended'; grantId: string }
  | { code: 'not_on_plan_version'; planCode: string }
  | { code: 'migration_target_not_current'; planCode: string; currentVersion: number; toVersion: number }
  | { code: 'invalid_source_versions'; toVersion: number; versions: number[] };

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
    case 'grant_disable_with_allowance':
      return `A grant switching ${error.featureKey} off carries no credits or limits`;
    case 'grant_disable_not_applicable':
      return `${error.featureKey} cannot be switched off by a grant; give a grant with a higher limit instead`;
    case 'grant_already_revoked':
      return `Grant ${error.grantId} is already revoked`;
    case 'grant_ended':
      return `Grant ${error.grantId} has already ended`;
    case 'not_on_plan_version':
      return `The account has no current subscription of "${error.planCode}" on an older version`;
    case 'migration_target_not_current':
      return `Subscribers move only to the current version of "${error.planCode}" (${error.currentVersion}), not ${error.toVersion}`;
    case 'invalid_source_versions':
      return `Source versions must be below ${error.toVersion}, got ${error.versions.join(', ')}`;
    default:
      return describePlanError(error);
  }
}
