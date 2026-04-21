import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Infrastructure — Prisma repositories
import { PrismaContainerRepository } from './infrastructure/persistence/prisma-container.repository.js';
import { PrismaContainerVersionRepository } from './infrastructure/persistence/prisma-container-version.repository.js';
import { PrismaContainerItemRepository } from './infrastructure/persistence/prisma-container-item.repository.js';
import { PrismaContainerLocalizationRepository } from './infrastructure/persistence/prisma-container-localization.repository.js';

// DI tokens
import { CONTAINER_REPOSITORY } from './domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from './domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from './domain/repositories/container-item.repository.interface.js';
import { CONTAINER_LOCALIZATION_REPOSITORY } from './domain/repositories/container-localization.repository.interface.js';

// Command handlers
import { CreateContainerHandler } from './application/commands/create-container/create-container.handler.js';
import { UpdateContainerHandler } from './application/commands/update-container/update-container.handler.js';
import { DeleteContainerHandler } from './application/commands/delete-container/delete-container.handler.js';
import { PublishVersionHandler } from './application/commands/publish-version/publish-version.handler.js';
import { CreateDraftFromPublishedHandler } from './application/commands/create-draft-from-published/create-draft-from-published.handler.js';
import { CancelDraftHandler } from './application/commands/cancel-draft/cancel-draft.handler.js';
import { ArchiveVersionHandler } from './application/commands/archive-version/archive-version.handler.js';
import { AddContainerItemHandler } from './application/commands/add-container-item/add-container-item.handler.js';
import { UpdateContainerItemHandler } from './application/commands/update-container-item/update-container-item.handler.js';
import { RemoveContainerItemHandler } from './application/commands/remove-container-item/remove-container-item.handler.js';
import { ReorderContainerItemsHandler } from './application/commands/reorder-container-items/reorder-container-items.handler.js';
import { CreateLocalizationHandler } from './application/commands/create-localization/create-localization.handler.js';
import { UpdateLocalizationHandler } from './application/commands/update-localization/update-localization.handler.js';
import { DeleteLocalizationHandler } from './application/commands/delete-localization/delete-localization.handler.js';

// Query handlers
import { GetContainerHandler } from './application/queries/get-container/get-container.handler.js';
import { GetContainersHandler } from './application/queries/get-containers/get-containers.handler.js';
import { GetContainerBySlugHandler } from './application/queries/get-container-by-slug/get-container-by-slug.handler.js';
import { GetContainerVersionsHandler } from './application/queries/get-container-versions/get-container-versions.handler.js';
import { GetContainerVersionHandler } from './application/queries/get-container-version/get-container-version.handler.js';
import { GetVersionItemsHandler } from './application/queries/get-version-items/get-version-items.handler.js';

// Controllers
import { ContainerController } from './presentation/controllers/container.controller.js';
import { ContainerVersionController } from './presentation/controllers/container-version.controller.js';
import { ContainerItemController } from './presentation/controllers/container-item.controller.js';

const CommandHandlers = [
  CreateContainerHandler,
  UpdateContainerHandler,
  DeleteContainerHandler,
  PublishVersionHandler,
  CreateDraftFromPublishedHandler,
  CancelDraftHandler,
  ArchiveVersionHandler,
  AddContainerItemHandler,
  UpdateContainerItemHandler,
  RemoveContainerItemHandler,
  ReorderContainerItemsHandler,
  CreateLocalizationHandler,
  UpdateLocalizationHandler,
  DeleteLocalizationHandler,
];

const QueryHandlers = [
  GetContainerHandler,
  GetContainersHandler,
  GetContainerBySlugHandler,
  GetContainerVersionsHandler,
  GetContainerVersionHandler,
  GetVersionItemsHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [ContainerController, ContainerVersionController, ContainerItemController],
  providers: [
    // Repository bindings
    { provide: CONTAINER_REPOSITORY, useClass: PrismaContainerRepository },
    { provide: CONTAINER_VERSION_REPOSITORY, useClass: PrismaContainerVersionRepository },
    { provide: CONTAINER_ITEM_REPOSITORY, useClass: PrismaContainerItemRepository },
    { provide: CONTAINER_LOCALIZATION_REPOSITORY, useClass: PrismaContainerLocalizationRepository },

    // CQRS handlers
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class ContainerModule {}
