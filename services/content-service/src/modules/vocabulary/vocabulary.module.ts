import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EntityResolverRegistry } from '../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { TaggableEntityType } from '../../shared/access-control/domain/types/taggable-entity-type.js';
import type { IVocabularyListRepository } from './domain/repositories/vocabulary-list.repository.interface.js';

// Infrastructure — Prisma repositories
import { PrismaVocabularyListRepository } from './infrastructure/persistence/prisma-vocabulary-list.repository.js';
import { PrismaVocabularyItemRepository } from './infrastructure/persistence/prisma-vocabulary-item.repository.js';
import { PrismaVocabularyItemTranslationRepository } from './infrastructure/persistence/prisma-vocabulary-item-translation.repository.js';
import { PrismaVocabularyUsageExampleRepository } from './infrastructure/persistence/prisma-vocabulary-usage-example.repository.js';
import { PrismaVocabularyExampleTranslationRepository } from './infrastructure/persistence/prisma-vocabulary-example-translation.repository.js';

// DI tokens
import { VOCABULARY_LIST_REPOSITORY } from './domain/repositories/vocabulary-list.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from './domain/repositories/vocabulary-item.repository.interface.js';
import { VOCABULARY_ITEM_TRANSLATION_REPOSITORY } from './domain/repositories/vocabulary-item-translation.repository.interface.js';
import { VOCABULARY_USAGE_EXAMPLE_REPOSITORY } from './domain/repositories/vocabulary-usage-example.repository.interface.js';
import { VOCABULARY_EXAMPLE_TRANSLATION_REPOSITORY } from './domain/repositories/vocabulary-example-translation.repository.interface.js';

// Domain services
import { TranslationFallbackSelectorService } from './domain/services/translation-fallback-selector.service.js';
import { GrammaticalPropertiesValidatorService } from './domain/services/grammatical-properties-validator.service.js';

// Infrastructure services
import { VocabularyDisplayCacheService } from './infrastructure/cache/vocabulary-display-cache.service.js';

// Command handlers — VocabularyList
import { CreateVocabularyListHandler } from './application/commands/create-vocabulary-list/create-vocabulary-list.handler.js';
import { UpdateVocabularyListHandler } from './application/commands/update-vocabulary-list/update-vocabulary-list.handler.js';
import { DeleteVocabularyListHandler } from './application/commands/delete-vocabulary-list/delete-vocabulary-list.handler.js';

// Command handlers — VocabularyItem
import { CreateVocabularyItemHandler } from './application/commands/create-vocabulary-item/create-vocabulary-item.handler.js';
import { BulkCreateVocabularyItemsHandler } from './application/commands/bulk-create-vocabulary-items/bulk-create-vocabulary-items.handler.js';
import { UpdateVocabularyItemHandler } from './application/commands/update-vocabulary-item/update-vocabulary-item.handler.js';
import { DeleteVocabularyItemHandler } from './application/commands/delete-vocabulary-item/delete-vocabulary-item.handler.js';
import { ReorderVocabularyItemsHandler } from './application/commands/reorder-vocabulary-items/reorder-vocabulary-items.handler.js';

// Command handlers — Translations
import { UpsertItemTranslationHandler } from './application/commands/upsert-item-translation/upsert-item-translation.handler.js';
import { DeleteItemTranslationHandler } from './application/commands/delete-item-translation/delete-item-translation.handler.js';

// Command handlers — Usage Examples
import { CreateUsageExampleHandler } from './application/commands/create-usage-example/create-usage-example.handler.js';
import { UpdateUsageExampleHandler } from './application/commands/update-usage-example/update-usage-example.handler.js';
import { DeleteUsageExampleHandler } from './application/commands/delete-usage-example/delete-usage-example.handler.js';

// Command handlers — Example Translations
import { UpsertExampleTranslationHandler } from './application/commands/upsert-example-translation/upsert-example-translation.handler.js';
import { DeleteExampleTranslationHandler } from './application/commands/delete-example-translation/delete-example-translation.handler.js';

// Query handlers
import { GetVocabularyListsHandler } from './application/queries/get-vocabulary-lists/get-vocabulary-lists.handler.js';
import { GetVocabularyListHandler } from './application/queries/get-vocabulary-list/get-vocabulary-list.handler.js';
import { GetVocabularyListBySlugHandler } from './application/queries/get-vocabulary-list-by-slug/get-vocabulary-list-by-slug.handler.js';
import { GetVocabularyListItemsHandler } from './application/queries/get-vocabulary-list-items/get-vocabulary-list-items.handler.js';
import { GetVocabularyItemHandler } from './application/queries/get-vocabulary-item/get-vocabulary-item.handler.js';
import { GetVocabularyItemForDisplayHandler } from './application/queries/get-vocabulary-item-for-display/get-vocabulary-item-for-display.handler.js';
import { BatchGetVocabularyItemsForDisplayHandler } from './application/queries/batch-get-vocabulary-items-for-display/batch-get-vocabulary-items-for-display.handler.js';

// Controllers
import { VocabularyListController } from './presentation/controllers/vocabulary-list.controller.js';
import { VocabularyItemController } from './presentation/controllers/vocabulary-item.controller.js';
import { VocabularyExampleController } from './presentation/controllers/vocabulary-example.controller.js';

const CommandHandlers = [
  // VocabularyList
  CreateVocabularyListHandler,
  UpdateVocabularyListHandler,
  DeleteVocabularyListHandler,
  // VocabularyItem
  CreateVocabularyItemHandler,
  BulkCreateVocabularyItemsHandler,
  UpdateVocabularyItemHandler,
  DeleteVocabularyItemHandler,
  ReorderVocabularyItemsHandler,
  // Item translations
  UpsertItemTranslationHandler,
  DeleteItemTranslationHandler,
  // Usage examples
  CreateUsageExampleHandler,
  UpdateUsageExampleHandler,
  DeleteUsageExampleHandler,
  // Example translations
  UpsertExampleTranslationHandler,
  DeleteExampleTranslationHandler,
];

const QueryHandlers = [
  GetVocabularyListsHandler,
  GetVocabularyListHandler,
  GetVocabularyListBySlugHandler,
  GetVocabularyListItemsHandler,
  GetVocabularyItemHandler,
  GetVocabularyItemForDisplayHandler,
  BatchGetVocabularyItemsForDisplayHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [VocabularyListController, VocabularyItemController, VocabularyExampleController],
  providers: [
    // Repository bindings
    { provide: VOCABULARY_LIST_REPOSITORY, useClass: PrismaVocabularyListRepository },
    { provide: VOCABULARY_ITEM_REPOSITORY, useClass: PrismaVocabularyItemRepository },
    {
      provide: VOCABULARY_ITEM_TRANSLATION_REPOSITORY,
      useClass: PrismaVocabularyItemTranslationRepository,
    },
    {
      provide: VOCABULARY_USAGE_EXAMPLE_REPOSITORY,
      useClass: PrismaVocabularyUsageExampleRepository,
    },
    {
      provide: VOCABULARY_EXAMPLE_TRANSLATION_REPOSITORY,
      useClass: PrismaVocabularyExampleTranslationRepository,
    },

    // Domain services
    TranslationFallbackSelectorService,
    GrammaticalPropertiesValidatorService,

    // Infrastructure services
    VocabularyDisplayCacheService,

    // CQRS handlers
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class VocabularyModule implements OnModuleInit {
  constructor(
    private readonly registry: EntityResolverRegistry,
    @Inject(VOCABULARY_LIST_REPOSITORY) private readonly vocabListRepo: IVocabularyListRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(TaggableEntityType.VOCABULARY_LIST, async (id) => {
      const list = await this.vocabListRepo.findById(id);
      if (!list) return null;
      return {
        id: list.id,
        entityType: TaggableEntityType.VOCABULARY_LIST,
        ownerUserId: list.ownerUserId,
        ownerSchoolId: list.ownerSchoolId,
        visibility: list.visibility,
        deletedAt: list.deletedAt,
      };
    });
  }
}
