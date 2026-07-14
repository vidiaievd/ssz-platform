import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { InternalController } from './presentation/controllers/internal.controller.js';
import { GetExpandedModuleHandler } from './application/queries/get-expanded-module/get-expanded-module.handler.js';
import { GetGlossarySuggestionsHandler } from './application/queries/get-glossary-suggestions/get-glossary-suggestions.handler.js';
import { GetPreflightHandler } from './application/queries/get-preflight/get-preflight.handler.js';
import { GetLeafItemsHandler } from '../container/application/queries/get-leaf-items/get-leaf-items.handler.js';
import { GetModuleReaderStructureHandler } from './application/queries/get-module-reader-structure/get-module-reader-structure.handler.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../lesson/domain/repositories/lesson-content-variant.repository.interface.js';
import { PrismaLessonContentVariantRepository } from '../lesson/infrastructure/persistence/prisma-lesson-content-variant.repository.js';

// Aggregates service-to-service-only routes (GET /internal/*) behind
// InternalAuthGuard. Most query handlers are registered by their owning feature
// modules (ContentRelationModule, GrammarRuleModule, CanDoModule); handlers
// exclusive to the internal aggregate view are registered here.
@Module({
  imports: [CqrsModule, PrismaModule],
  controllers: [InternalController],
  providers: [
    GetExpandedModuleHandler,
    GetGlossarySuggestionsHandler,
    GetPreflightHandler,
    GetLeafItemsHandler,
    GetModuleReaderStructureHandler,
    { provide: LESSON_CONTENT_VARIANT_REPOSITORY, useClass: PrismaLessonContentVariantRepository },
  ],
})
export class InternalModule {}
