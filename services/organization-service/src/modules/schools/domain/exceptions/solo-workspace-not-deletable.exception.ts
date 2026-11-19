/**
 * A private tutor's own workspace is not deleted by its owner (plan 90, live check, block 9).
 * The tutor has exactly one: archiving it would leave them without a place to work until the
 * purge, and a new one cannot be opened meanwhile. A platform admin can still close it.
 * → 409 `SOLO_WORKSPACE_NOT_DELETABLE`.
 */
export class SoloWorkspaceNotDeletableException extends Error {
  constructor(public readonly schoolId: string) {
    super(`Workspace ${schoolId} is a solo workspace; its owner cannot delete it`);
    this.name = 'SoloWorkspaceNotDeletableException';
  }
}
