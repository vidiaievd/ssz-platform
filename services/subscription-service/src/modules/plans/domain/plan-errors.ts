/**
 * Business refusals around plans. Every one of them is a 422 at the edge: the request is
 * well-formed, the plan it describes is not acceptable.
 */
export type PlanError =
  | { code: 'unknown_feature_key'; featureKey: string }
  | { code: 'duplicate_feature_key'; featureKey: string }
  | { code: 'credits_not_applicable'; featureKey: string }
  | { code: 'invalid_credits'; featureKey: string; value: string }
  | { code: 'unknown_limit'; featureKey: string; limit: string }
  | { code: 'invalid_limit'; featureKey: string; limit: string }
  | { code: 'invalid_plan_code'; value: string }
  | { code: 'plan_archived'; planCode: string }
  | { code: 'plan_already_archived'; planCode: string };

export function describePlanError(error: PlanError): string {
  switch (error.code) {
    case 'unknown_feature_key':
      return `Unknown feature key "${error.featureKey}"`;
    case 'duplicate_feature_key':
      return `Feature key "${error.featureKey}" is listed twice`;
    case 'credits_not_applicable':
      return `Feature key "${error.featureKey}" is not metered in credits`;
    case 'invalid_credits':
      return `Monthly credits for "${error.featureKey}" must be a non-negative decimal, got "${error.value}"`;
    case 'unknown_limit':
      return `Feature key "${error.featureKey}" has no limit "${error.limit}"`;
    case 'invalid_limit':
      return `Limit "${error.limit}" of "${error.featureKey}" must be a non-negative number`;
    case 'invalid_plan_code':
      return `Plan code must be lower_snake_case, got "${error.value}"`;
    case 'plan_archived':
      return `Plan "${error.planCode}" is archived and cannot be assigned`;
    case 'plan_already_archived':
      return `Plan "${error.planCode}" is already archived`;
  }
}
