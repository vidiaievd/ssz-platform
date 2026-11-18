import type { WorkspaceStatus } from '../../domain/workspace-status.js';

export interface IWorkspaceStatusStore {
  /** `active` when nothing was heard about the school. Throws when the store cannot be read. */
  get(schoolId: string): Promise<WorkspaceStatus>;
  /**
   * Stores the status unless a newer event already set one; false = skipped as older.
   * `at` is when the event happened, not when it arrived.
   */
  save(schoolId: string, status: WorkspaceStatus, at: Date): Promise<boolean>;
}

export const WORKSPACE_STATUS_STORE = Symbol('WORKSPACE_STATUS_STORE');
