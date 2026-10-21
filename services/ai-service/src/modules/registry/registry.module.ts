import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module.js';
import { PutBindingHandler } from './application/commands/put-binding/put-binding.handler.js';
import { TestModelHandler } from './application/commands/test-model/test-model.handler.js';
import { BINDING_REPOSITORY } from './application/ports/binding.repository.js';
import { BINDING_CHANGE_NOTIFIER, BINDING_SOURCE } from './application/ports/binding.source.js';
import { CREDENTIAL_PRESENCE } from './application/ports/credential-presence.js';
import { REGISTRY_READER } from './application/ports/registry.reader.js';
import { GetBindingHistoryHandler } from './application/queries/get-binding-history/get-binding-history.handler.js';
import { GetBindingHandler } from './application/queries/get-binding/get-binding.handler.js';
import { ListBindingsHandler } from './application/queries/list-bindings/list-bindings.handler.js';
import { ListModelPricesHandler } from './application/queries/list-model-prices/list-model-prices.handler.js';
import { ListModelsHandler } from './application/queries/list-models/list-models.handler.js';
import { ListProvidersHandler } from './application/queries/list-providers/list-providers.handler.js';
import { CachedBindingSource } from './infrastructure/cache/cached-binding.source.js';
import { EnvCredentialPresence } from './infrastructure/credentials/env-credential-presence.js';
import { PrismaBindingRepository } from './infrastructure/persistence/prisma-binding.repository.js';
import { PrismaRegistryReader } from './infrastructure/persistence/prisma-registry.reader.js';
import { AdminBindingsController } from './presentation/controllers/admin-bindings.controller.js';
import { AdminRegistryController } from './presentation/controllers/admin-registry.controller.js';

@Module({
  imports: [ProvidersModule],
  controllers: [AdminRegistryController, AdminBindingsController],
  providers: [
    ListProvidersHandler,
    ListModelsHandler,
    ListModelPricesHandler,
    TestModelHandler,
    ListBindingsHandler,
    GetBindingHandler,
    GetBindingHistoryHandler,
    PutBindingHandler,
    { provide: REGISTRY_READER, useClass: PrismaRegistryReader },
    { provide: CREDENTIAL_PRESENCE, useClass: EnvCredentialPresence },
    { provide: BINDING_REPOSITORY, useClass: PrismaBindingRepository },
    CachedBindingSource,
    { provide: BINDING_SOURCE, useExisting: CachedBindingSource },
    { provide: BINDING_CHANGE_NOTIFIER, useExisting: CachedBindingSource },
  ],
  exports: [REGISTRY_READER, CREDENTIAL_PRESENCE, BINDING_SOURCE],
})
export class RegistryModule {}
