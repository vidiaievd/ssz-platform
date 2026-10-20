import { Module } from '@nestjs/common';
import { CREDENTIAL_PRESENCE } from './application/ports/credential-presence.js';
import { REGISTRY_READER } from './application/ports/registry.reader.js';
import { ListModelPricesHandler } from './application/queries/list-model-prices/list-model-prices.handler.js';
import { ListModelsHandler } from './application/queries/list-models/list-models.handler.js';
import { ListProvidersHandler } from './application/queries/list-providers/list-providers.handler.js';
import { EnvCredentialPresence } from './infrastructure/credentials/env-credential-presence.js';
import { PrismaRegistryReader } from './infrastructure/persistence/prisma-registry.reader.js';
import { AdminRegistryController } from './presentation/controllers/admin-registry.controller.js';

@Module({
  controllers: [AdminRegistryController],
  providers: [
    ListProvidersHandler,
    ListModelsHandler,
    ListModelPricesHandler,
    { provide: REGISTRY_READER, useClass: PrismaRegistryReader },
    { provide: CREDENTIAL_PRESENCE, useClass: EnvCredentialPresence },
  ],
  exports: [REGISTRY_READER, CREDENTIAL_PRESENCE],
})
export class RegistryModule {}
