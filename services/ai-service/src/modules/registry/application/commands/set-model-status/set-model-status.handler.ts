import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { REGISTRY_READER, type IRegistryReader, type ModelWithCurrentPrice } from '../../ports/registry.reader.js';
import { REGISTRY_WRITER, type IRegistryWriter } from '../../ports/registry.writer.js';
import { StrandedBindings } from '../../stranded-bindings.js';
import { SetModelStatusCommand } from './set-model-status.command.js';

/** The model as `GET models` lists it, plus what the switch did. */
export type SetModelStatusResult = ModelWithCurrentPrice & {
  /** False when the model already had the asked status: no write, no trail entry. */
  changed: boolean;
  /** Switched-on bindings using this model with no model left that serves. */
  strandedCapabilities: string[];
};

/**
 * A model's status (plan 90, phase 7, step 7): `disabled` takes it out of every binding at once
 * (the router steps to the fallback) and keeps new bindings off it; `deprecated` is a label —
 * the model still serves. Goes to the trail as `model.status_changed`.
 */
@CommandHandler(SetModelStatusCommand)
export class SetModelStatusHandler implements ICommandHandler<SetModelStatusCommand, SetModelStatusResult> {
  constructor(
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(REGISTRY_WRITER) private readonly writer: IRegistryWriter,
    private readonly stranded: StrandedBindings,
  ) {}

  async execute(command: SetModelStatusCommand): Promise<SetModelStatusResult> {
    const now = new Date();
    const written = await this.writer.setModelStatus(command.modelId, command.status, (before) =>
      adminAuditEntry({
        actor: command.admin,
        action: 'model.status_changed',
        targetType: 'model',
        targetId: command.modelId,
        reason: command.reason,
        before: { ...before },
        after: { ...before, status: command.status },
        now,
      }),
    );
    if (!written) throw new NotFoundException(`Model ${command.modelId} not found`);

    const [found, strandedCapabilities] = await Promise.all([
      this.registry.getModelForCall(command.modelId, now),
      this.stranded.touching([command.modelId]),
    ]);
    return { ...written.value, currentPrice: found?.currentPrice ?? null, changed: written.changed, strandedCapabilities };
  }
}
