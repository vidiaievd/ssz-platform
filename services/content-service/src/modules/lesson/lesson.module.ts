import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EntityResolverRegistry } from '../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { TaggableEntityType } from '../../shared/access-control/domain/types/taggable-entity-type.js';
import type { ILessonRepository } from './domain/repositories/lesson.repository.interface.js';

// Infrastructure — Prisma repositories
import { PrismaLessonRepository } from './infrastructure/persistence/prisma-lesson.repository.js';
import { PrismaLessonContentVariantRepository } from './infrastructure/persistence/prisma-lesson-content-variant.repository.js';
import { PrismaLessonVariantMediaRefRepository } from './infrastructure/persistence/prisma-lesson-variant-media-ref.repository.js';
import { PrismaLessonVideoCueRepository } from './infrastructure/persistence/prisma-lesson-video-cue.repository.js';
import { PrismaLessonVideoQuestionRepository } from './infrastructure/persistence/prisma-lesson-video-question.repository.js';
import { PrismaLessonListeningStageRepository } from './infrastructure/persistence/prisma-lesson-listening-stage.repository.js';
import { PrismaLessonParagraphTranslationRepository } from './infrastructure/persistence/prisma-lesson-paragraph-translation.repository.js';
import { PrismaLessonGlossaryMarkRepository } from './infrastructure/persistence/prisma-lesson-glossary-mark.repository.js';
import { PrismaExerciseRepository } from '../exercise/infrastructure/persistence/prisma-exercise.repository.js';
import { PrismaVocabularyItemRepository } from '../vocabulary/infrastructure/persistence/prisma-vocabulary-item.repository.js';
import { PrismaContentRelationRepository } from '../content-relation/infrastructure/persistence/prisma-content-relation.repository.js';

// DI tokens
import { LESSON_REPOSITORY } from './domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from './domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_VARIANT_MEDIA_REF_REPOSITORY } from './domain/repositories/lesson-variant-media-ref.repository.interface.js';
import { LESSON_VIDEO_CUE_REPOSITORY } from './domain/repositories/lesson-video-cue.repository.interface.js';
import { LESSON_VIDEO_QUESTION_REPOSITORY } from './domain/repositories/lesson-video-question.repository.interface.js';
import { LESSON_LISTENING_STAGE_REPOSITORY } from './domain/repositories/lesson-listening-stage.repository.interface.js';
import { LESSON_PARAGRAPH_TRANSLATION_REPOSITORY } from './domain/repositories/lesson-paragraph-translation.repository.interface.js';
import { LESSON_GLOSSARY_MARK_REPOSITORY } from './domain/repositories/lesson-glossary-mark.repository.interface.js';
import { EXERCISE_REPOSITORY } from '../exercise/domain/repositories/exercise.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import { CONTENT_RELATION_REPOSITORY } from '../content-relation/domain/repositories/content-relation.repository.interface.js';

// Command handlers
import { CreateLessonHandler } from './application/commands/create-lesson/create-lesson.handler.js';
import { UpdateLessonHandler } from './application/commands/update-lesson/update-lesson.handler.js';
import { DeleteLessonHandler } from './application/commands/delete-lesson/delete-lesson.handler.js';
import { CreateVariantHandler } from './application/commands/create-variant/create-variant.handler.js';
import { UpdateVariantHandler } from './application/commands/update-variant/update-variant.handler.js';
import { PublishVariantHandler } from './application/commands/publish-variant/publish-variant.handler.js';
import { DeleteVariantHandler } from './application/commands/delete-variant/delete-variant.handler.js';
import { SetVideoCuesHandler } from './application/commands/set-video-cues/set-video-cues.handler.js';
import { SetVideoQuestionHandler } from './application/commands/set-video-question/set-video-question.handler.js';
import { ClearVideoQuestionHandler } from './application/commands/clear-video-question/clear-video-question.handler.js';
import { CreateListeningStageHandler } from './application/commands/create-listening-stage/create-listening-stage.handler.js';
import { SetParagraphTranslationsHandler } from './application/commands/set-paragraph-translations/set-paragraph-translations.handler.js';
import { MarkGlossaryWordHandler } from './application/commands/mark-glossary-word/mark-glossary-word.handler.js';

// Query handlers
import { GetLessonHandler } from './application/queries/get-lesson/get-lesson.handler.js';
import { GetLessonsHandler } from './application/queries/get-lessons/get-lessons.handler.js';
import { GetLessonBySlugHandler } from './application/queries/get-lesson-by-slug/get-lesson-by-slug.handler.js';
import { GetLessonVariantsHandler } from './application/queries/get-lesson-variants/get-lesson-variants.handler.js';
import { GetLessonVariantHandler } from './application/queries/get-lesson-variant/get-lesson-variant.handler.js';
import { GetBestVariantHandler } from './application/queries/get-best-variant/get-best-variant.handler.js';
import { GetVideoCuesHandler } from './application/queries/get-video-cues/get-video-cues.handler.js';
import { GetVideoQuestionHandler } from './application/queries/get-video-question/get-video-question.handler.js';
import { GetListeningStagesHandler } from './application/queries/get-listening-stages/get-listening-stages.handler.js';
import { GetTextParagraphsHandler } from './application/queries/get-text-paragraphs/get-text-paragraphs.handler.js';
import { GetGlossaryMarksHandler } from './application/queries/get-glossary-marks/get-glossary-marks.handler.js';
import { GetLessonReaderContentHandler } from './application/queries/get-lesson-reader-content/get-lesson-reader-content.handler.js';

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
  SetVideoCuesHandler,
  SetVideoQuestionHandler,
  ClearVideoQuestionHandler,
  CreateListeningStageHandler,
  SetParagraphTranslationsHandler,
  MarkGlossaryWordHandler,
];

const QueryHandlers = [
  GetLessonHandler,
  GetLessonsHandler,
  GetLessonBySlugHandler,
  GetLessonVariantsHandler,
  GetLessonVariantHandler,
  GetBestVariantHandler,
  GetVideoCuesHandler,
  GetVideoQuestionHandler,
  GetListeningStagesHandler,
  GetTextParagraphsHandler,
  GetGlossaryMarksHandler,
  GetLessonReaderContentHandler,
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
    { provide: LESSON_VIDEO_CUE_REPOSITORY, useClass: PrismaLessonVideoCueRepository },
    { provide: LESSON_VIDEO_QUESTION_REPOSITORY, useClass: PrismaLessonVideoQuestionRepository },
    { provide: LESSON_LISTENING_STAGE_REPOSITORY, useClass: PrismaLessonListeningStageRepository },
    {
      provide: LESSON_PARAGRAPH_TRANSLATION_REPOSITORY,
      useClass: PrismaLessonParagraphTranslationRepository,
    },
    { provide: LESSON_GLOSSARY_MARK_REPOSITORY, useClass: PrismaLessonGlossaryMarkRepository },
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },
    { provide: VOCABULARY_ITEM_REPOSITORY, useClass: PrismaVocabularyItemRepository },
    { provide: CONTENT_RELATION_REPOSITORY, useClass: PrismaContentRelationRepository },

    // CQRS handlers
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class LessonModule implements OnModuleInit {
  constructor(
    private readonly registry: EntityResolverRegistry,
    @Inject(LESSON_REPOSITORY) private readonly lessonRepo: ILessonRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(TaggableEntityType.LESSON, async (id) => {
      const lesson = await this.lessonRepo.findById(id);
      if (!lesson) return null;
      return {
        id: lesson.id,
        entityType: TaggableEntityType.LESSON,
        ownerUserId: lesson.ownerUserId,
        ownerSchoolId: lesson.ownerSchoolId,
        visibility: lesson.visibility,
        deletedAt: lesson.deletedAt,
      };
    });
  }
}
