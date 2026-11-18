import type { AdminActor } from '../../../../../shared/application/admin-audit.js';

export class ResetBreakerCommand {
  constructor(
    readonly modelId: string,
    readonly admin: AdminActor,
    readonly reason: string,
  ) {}
}
