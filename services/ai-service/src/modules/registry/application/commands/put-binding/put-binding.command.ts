import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { BindingSettings } from '../../../domain/binding.js';

export class PutBindingCommand {
  constructor(
    readonly capability: string,
    readonly settings: BindingSettings,
    readonly expectedVersion: number | undefined,
    readonly admin: AdminActor,
    /** Required: the write goes to the admin trail (plan 90, phase 7, step 1). */
    readonly reason: string,
  ) {}
}
