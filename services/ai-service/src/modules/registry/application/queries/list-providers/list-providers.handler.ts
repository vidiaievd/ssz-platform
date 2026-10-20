import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CREDENTIAL_PRESENCE, type ICredentialPresence } from '../../ports/credential-presence.js';
import { REGISTRY_READER, type IRegistryReader, type ProviderWithModelCount } from '../../ports/registry.reader.js';
import { providerReadiness, type ProviderReadiness } from '../../provider-readiness.js';
import { ListProvidersQuery } from './list-providers.query.js';

export type ProviderListItem = ProviderWithModelCount & ProviderReadiness;

@QueryHandler(ListProvidersQuery)
export class ListProvidersHandler implements IQueryHandler<ListProvidersQuery, ProviderListItem[]> {
  constructor(
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(CREDENTIAL_PRESENCE) private readonly credentials: ICredentialPresence,
  ) {}

  async execute(): Promise<ProviderListItem[]> {
    const providers = await this.registry.listProviders();
    return providers.map((p) => ({ ...p, ...providerReadiness(p, this.credentials) }));
  }
}
