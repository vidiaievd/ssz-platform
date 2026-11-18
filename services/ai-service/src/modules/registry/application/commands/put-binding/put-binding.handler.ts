import { ConflictException, Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { findCapability } from '../../../../capabilities/catalog.js';
import type { AiBinding } from '../../../domain/binding.js';
import { bindingProblems } from '../../binding-check.js';
import { BINDING_REPOSITORY, type IBindingRepository } from '../../ports/binding.repository.js';
import { BINDING_CHANGE_NOTIFIER, type IBindingChangeNotifier } from '../../ports/binding.source.js';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from '../../ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader } from '../../ports/registry.reader.js';
import { PutBindingCommand } from './put-binding.command.js';

/**
 * Creates or replaces a capability's binding, after checking both models can serve it, and puts the
 * write on the admin trail (`binding.changed`, plan 90, phase 7, step 1) in the same transaction.
 * A write that changes nothing is still recorded: the admin stated a reason for it.
 */
@CommandHandler(PutBindingCommand)
export class PutBindingHandler implements ICommandHandler<PutBindingCommand, AiBinding> {
  constructor(
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(CREDENTIAL_PRESENCE) private readonly credentials: ICredentialPresence,
    @Inject(BINDING_REPOSITORY) private readonly bindings: IBindingRepository,
    @Inject(BINDING_CHANGE_NOTIFIER) private readonly notifier: IBindingChangeNotifier,
  ) {}

  async execute(command: PutBindingCommand): Promise<AiBinding> {
    const capability = findCapability(command.capability);
    if (!capability) throw new NotFoundException(`Unknown capability "${command.capability}"`);

    const { settings } = command;
    const now = new Date();
    const [primary, fallback] = await Promise.all([
      this.registry.getModelForCall(settings.primaryModelId, now),
      settings.fallbackModelId ? this.registry.getModelForCall(settings.fallbackModelId, now) : null,
    ]);

    const problems = bindingProblems({ capability, settings, primary, fallback, credentials: this.credentials });
    if (problems.length > 0) {
      throw new UnprocessableEntityException({
        message: `Binding for "${capability.code}" cannot be written`,
        missing: problems,
      });
    }

    const saved = await this.bindings.save(capability.code, settings, command.expectedVersion, (before, version) =>
      adminAuditEntry({
        actor: command.admin,
        action: 'binding.changed',
        targetType: 'capability',
        targetId: capability.code,
        reason: command.reason,
        before: before ? { ...before } : null,
        after: { ...settings, version },
        now,
      }),
    );
    if (saved.isFail) {
      throw new ConflictException(
        `Binding for "${capability.code}" changed since version ${command.expectedVersion}; reload and retry`,
      );
    }
    await this.notifier.changed(capability.code);
    return saved.value;
  }
}
