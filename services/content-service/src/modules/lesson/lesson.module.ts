import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Infrastructure — Prisma repositories
import { PrismaLessonRepository } from './infrastructure/persistence/prisma-lesson.repository.js';
import { PrismaLessonContentVariantRepository } from './infrastructure/persistence/prisma-lesson-content-variant.repository.js';
import { PrismaLessonVariantMediaRefRepository } from './infrastructure/persistence/prisma-lesson-variant-media-ref.repository.js';

// DI tokens
import { LESSON_REPOSITORY } from './domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from './domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_VARIANT_MEDIA_REF_REPOSITORY } from './domain/repositories/lesson-variant-media-ref.repository.interface.js';

// Command handlers
import { CreateLessonHandler } from './application/commands/create-lesson/create-lesson.handler.js';
import { UpdateLessonHandler } from './application/commands/update-lesson/update-lesson.handler.js';
import { DeleteLessonHandler } from './application/commands/delete-lesson/delete-lesson.handler.js';
import { CreateVariantHandler } from './application/commands/create-variant/create-variant.handler.js';
import { UpdateVariantHandler } from './application/commands/update-variant/update-variant.handler.js';
import { PublishVariantHandler } from './application/commands/publish-variant/publish-variant.handler.js';
import { DeleteVariantHandler } from './application/commands/delete-variant/delete-variant.handler.js';

// Query handlers
import { GetLessonHandler } from './application/queries/get-lesson/get-lesson.handler.js';
import { GetLessonsHandler } from './application/queries/get-lessons/get-lessons.handler.js';
import { GetLessonBySlugHandler } from './application/queries/get-lesson-by-slug/get-lesson-by-slug.handler.js';
import { GetLessonVariantsHandler } from './application/queries/get-lesson-variants/get-lesson-variants.handler.js';
import { GetLessonVariantHandler } from './application/queries/get-lesson-variant/get-lesson-variant.handler.js';
import { GetBestVariantHandler } from './application/queries/get-best-variant/get-best-variant.handler.js';

// Controller
import { LessonController } from './presentation/controllers/lesson.controller.js';

const CommandHandlers = [
  CreateLessonHandler,
  UpdateLessonHandler,
  DeleteLessonHandler,
  CreateVariantHandler,
  UpdateVariantHandler,
  PublishVariantHandler,
  DeleteVariantHandler,
];

const QueryHandlers = [
  GetLessonHandler,
  GetLessonsHandler,
  GetLessonBySlugHandler,
  GetLessonVariantsHandler,
  GetLessonVariantHandler,
  GetBestVariantHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [LessonController],
  providers: [
    // Repository bindings
    { provide: LESSON_REPOSITORY, useClass: PrismaLessonRepository },
    { provide: LESSON_CONTENT_VARIANT_REPOSITORY, useClass: PrismaLessonContentVariantRepository },
    {
      provide: LESSON_VARIANT_MEDIA_REF_REPOSITORY,
      useClass: PrismaLessonVariantMediaRefRepository,
    },

    // CQRS handlers
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class LessonModule {}
