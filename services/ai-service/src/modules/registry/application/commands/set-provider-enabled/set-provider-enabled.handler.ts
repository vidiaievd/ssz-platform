import { Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from '../../ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader, type ProviderWithModelCount } from '../../ports/registry.reader.js';
import { REGISTRY_WRITER, type IRegistryWriter } from '../../ports/registry.writer.js';
import { providerReadiness, type ProviderReadiness } from '../../provider-readiness.js';
import { StrandedBindings } from '../../stranded-bindings.js';
import { SetProviderEnabledCommand } from './set-provider-enabled.command.js';

/** The provider as `GET providers` lists it, plus what the switch did. */
export type SetProviderEnabledResult = ProviderWithModelCount &
  ProviderReadiness & {
    /** False when the provider already was in the asked state: no write, no trail entry. */
    changed: boolean;
    /** Switched-on bindings on this provider's models with no model left that serves. */
    strandedCapabilities: string[];
  };

/**
 * The admin's switch over a whole provider (plan 90, phase 7, step 7). Off: the router steps
 * over each of its models to the binding's fallback, or answers `unavailable` where none is left —
 * the answer names those bindings. On: only when the environment has everything a call needs,
 * else 422 with what is missing. A flip goes to the trail as `provider.toggled`.
 */
@CommandHandler(SetProviderEnabledCommand)
export class SetProviderEnabledHandler implements ICommandHandler<SetProviderEnabledCommand, SetProviderEnabledResult> {
  constructor(
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(REGISTRY_WRITER) private readonly writer: IRegistryWriter,
    @Inject(CREDENTIAL_PRESENCE) private readonly credentials: ICredentialPresence,
    private readonly stranded: StrandedBindings,
  ) {}

  async execute(command: SetProviderEnabledCommand): Promise<SetProviderEnabledResult> {
    const provider = await this.registry.getProvider(command.providerId);
    if (!provider) throw new NotFoundException(`Provider ${command.providerId} not found`);

    const readiness = providerReadiness(provider, this.credentials);
    if (command.enabled && !readiness.configured) {
      throw new UnprocessableEntityException({
        message: `Provider "${provider.code}" is not configured`,
        missing: readiness.missing,
      });
    }

    const now = new Date();
    const written = await this.writer.setProviderEnabled(provider.id, command.enabled, (before) =>
      adminAuditEntry({
        actor: command.admin,
        action: 'provider.toggled',
        targetType: 'provider',
        targetId: provider.id,
        reason: command.reason,
        before: { ...before },
        after: { code: before.code, enabled: command.enabled },
        now,
      }),
    );
    if (!written) throw new NotFoundException(`Provider ${command.providerId} not found`);

    const models = await this.registry.listModels({ providerId: provider.id }, now);
    const strandedCapabilities = await this.stranded.touching(models.map((m) => m.id));
    return { ...written.value, modelCount: models.length, ...readiness, changed: written.changed, strandedCapabilities };
  }
}
