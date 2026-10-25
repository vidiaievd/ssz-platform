/**
 * subscription-service's `GET /internal/entitlements` (plan 78), asked only whether a
 * workspace's plan has one feature key on.
 *
 * Throws when the answer cannot be had: a setting the plan has to allow is not saved on a
 * guess, either way.
 */
export interface IWorkspaceEntitlementsPort {
  isEnabled(workspaceId: string, featureKey: string): Promise<boolean>;
}

export const WORKSPACE_ENTITLEMENTS_PORT = Symbol('IWorkspaceEntitlementsPort');
