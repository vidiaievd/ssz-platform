import type { AdminActor } from '../../../../../shared/application/admin-audit.js';

export class ArchivePlanCommand {
  constructor(
    readonly code: string,
    readonly actor: AdminActor,
    readonly reason: string,
  ) {}
}
