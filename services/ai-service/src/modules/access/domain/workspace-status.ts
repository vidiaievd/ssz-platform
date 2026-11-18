/**
 * A school's lifecycle status as ai-service knows it (plan 90, phase 5, step 6). Only an `active`
 * school pays for AI: a suspended school is read-only, a closed or purged one is gone. A school
 * nothing was heard about is `active` — the projection starts empty and only events fill it.
 */
export const WORKSPACE_STATUSES = ['active', 'suspended', 'closed', 'purged'] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

/** The status a `school.*` event leaves the school in; null for any other event. */
export function statusAfterEvent(routingKey: string): WorkspaceStatus | null {
  switch (routingKey) {
    case 'school.suspended':
      return 'suspended';
    case 'school.reactivated':
    case 'school.restored':
      return 'active';
    case 'school.closed':
      return 'closed';
    case 'school.purged':
      return 'purged';
    default:
      return null;
  }
}
