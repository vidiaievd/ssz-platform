import type { AdminActor } from '../../../../../shared/application/admin-audit.js';

export class RenamePlanCommand {
  constructor(
    readonly code: string,
    readonly name: string,
    readonly actor: AdminActor,
    readonly reason: string,
  ) {}
}
