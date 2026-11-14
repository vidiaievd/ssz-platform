import { Inject, Injectable } from '@nestjs/common';
import type { AiBinding } from '../domain/binding.js';
import { BINDING_REPOSITORY, type IBindingRepository } from './ports/binding.repository.js';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from './ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader, type ModelForCall } from './ports/registry.reader.js';
import { providerReadiness } from './provider-readiness.js';

/**
 * Whether the router could call this model at all, leaving aside what changes by the minute
 * (the breaker) and by the call (regions, input fit): it exists, is not `disabled`, and its
 * provider is switched on and configured.
 */
export function modelServes(found: ModelForCall | null, credentials: ICredentialPresence): boolean {
  if (!found) return false;
  if (found.model.status === 'disabled') return false;
  if (!found.provider.enabled) return false;
  return providerReadiness(found.provider, credentials).configured;
}

/**
 * Switched-on bindings that use one of `touched` and have no model left that serves — every call
 * of theirs now ends `unavailable`. Pure: the caller hands in the bindings and the models they name.
 */
export function strandedCapabilities(
  bindings: AiBinding[],
  touched: ReadonlySet<string>,
  models: ReadonlyMap<string, ModelForCall | null>,
  credentials: ICredentialPresence,
): string[] {
  return bindings
    .filter((b) => b.enabled)
    .filter((b) => touched.has(b.primaryModelId) || (b.fallbackModelId !== null && touched.has(b.fallbackModelId)))
    .filter((b) => {
      const ids = [b.primaryModelId, ...(b.fallbackModelId ? [b.fallbackModelId] : [])];
      return ids.every((id) => !modelServes(models.get(id) ?? null, credentials));
    })
    .map((b) => b.capability)
    .sort();
}

/** Reads what `strandedCapabilities` needs, after a switch has been written. */
@Injectable()
export class StrandedBindings {
  constructor(
    @Inject(BINDING_REPOSITORY) private readonly bindings: IBindingRepository,
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(CREDENTIAL_PRESENCE) private readonly credentials: ICredentialPresence,
  ) {}

  async touching(modelIds: Iterable<string>): Promise<string[]> {
    const touched = new Set(modelIds);
    if (touched.size === 0) return [];
    const bindings = (await this.bindings.list()).filter(
      (b) => touched.has(b.primaryModelId) || (b.fallbackModelId !== null && touched.has(b.fallbackModelId)),
    );
    const ids = new Set(bindings.flatMap((b) => [b.primaryModelId, ...(b.fallbackModelId ? [b.fallbackModelId] : [])]));
    const now = new Date();
    const models = new Map<string, ModelForCall | null>(
      await Promise.all([...ids].map(async (id) => [id, await this.registry.getModelForCall(id, now)] as const)),
    );
    return strandedCapabilities(bindings, touched, models, this.credentials);
  }
}
