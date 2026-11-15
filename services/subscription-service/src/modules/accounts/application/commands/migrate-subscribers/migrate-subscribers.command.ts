import type { AdminActor } from '../../../../../shared/application/admin-audit.js';

export class MigrateSubscribersCommand {
  constructor(
    readonly planCode: string,
    /** Must be the plan's current version. */
    readonly toVersion: number,
    /** null = every version below `toVersion`. */
    readonly fromVersions: readonly number[] | null,
    readonly dryRun: boolean,
    readonly actor: AdminActor,
    /** Required for a run; a preview may go without. */
    readonly reason: string | null,
    /** The run's id from its first call; absent = this call starts a run. */
    readonly batchId: string | null,
  ) {}
}
