import type { BindingSettings } from '../../../domain/binding.js';

export class PutBindingCommand {
  constructor(
    readonly capability: string,
    readonly settings: BindingSettings,
    readonly expectedVersion: number | undefined,
    readonly actorUserId: string,
  ) {}
}
