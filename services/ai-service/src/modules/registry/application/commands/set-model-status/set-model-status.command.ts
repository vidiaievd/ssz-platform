import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { AiModelStatus } from '../../../domain/registry.types.js';

export class SetModelStatusCommand {
  constructor(
    readonly modelId: string,
    readonly status: AiModelStatus,
    readonly admin: AdminActor,
    readonly reason: string,
  ) {}
}
