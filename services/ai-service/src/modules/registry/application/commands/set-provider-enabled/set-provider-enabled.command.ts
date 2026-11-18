import type { AdminActor } from '../../../../../shared/application/admin-audit.js';

export class SetProviderEnabledCommand {
  constructor(
    readonly providerId: string,
    readonly enabled: boolean,
    readonly admin: AdminActor,
    readonly reason: string,
  ) {}
}
