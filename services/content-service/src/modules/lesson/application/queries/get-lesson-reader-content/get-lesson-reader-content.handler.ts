import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetLessonReaderContentQuery } from './get-lesson-reader-content.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { BestVariantSelectorService } from '../../../domain/services/best-variant-selector.service.js';
import { MarkdownParagraphSplitterService } from '../../../domain/services/markdown-paragraph-splitter.service.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_VARIANT_MEDIA_REF_REPOSITORY } from '../../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import type { ILessonVariantMediaRefRepository } from '../../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import { LESSON_VIDEO_CUE_REPOSITORY } from '../../../domain/repositories/lesson-video-cue.repository.interface.js';
import type { ILessonVideoCueRepository } from '../../../domain/repositories/lesson-video-cue.repository.interface.js';
import { LESSON_LISTENING_STAGE_REPOSITORY } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';
import type { ILessonListeningStageRepository } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';
import { LESSON_PARAGRAPH_TRANSLATION_REPOSITORY } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';
import type { ILessonParagraphTranslationRepository } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';
import { LESSON_GLOSSARY_MARK_REPOSITORY } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type { ILessonGlossaryMarkRepository } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import { EXERCISE_REPOSITORY } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';

export interface ReaderGlossaryEntry {
  id: string;
  word: string;
  partOfSpeech: string | null;
  translation: { language: string; text: string; definition: string | null } | null;
}

export interface ReaderParagraph {
  target: string;
  translation: string | null;
}

export interface ReaderVideoCue {
  position: number;
  startSeconds: number;
  targetLine: string;
  translationLine: string | null;
}

export interface ReaderListeningStageExercise {
  id: string;
  templateCode: string;
  content: Record<string, unknown>;
  instructions: { language: string; text: string; hint: string | null }[];
}

export interface ReaderListeningStage {
  position: number;
  stageType: string;
  exercise: ReaderListeningStageExercise | null;
}

export interface ReaderLiveInfo {
  startsAt: string | null;
  durationMinutes: number | null;
  joinUrl: string | null;
  capacity: number | null;
}

export interface LessonReaderContent {
  lessonId: string;
  kind: LessonKind;
  title: string;
  displayTitle: string | null;
  bodyMarkdown: string | null;
  mediaIds: string[];
  paragraphs: ReaderParagraph[] | null;
  cues: ReaderVideoCue[] | null;
  transcript: string | null;
  listeningStages: ReaderListeningStage[] | null;
  glossary: ReaderGlossaryEntry[];
  live: ReaderLiveInfo | null;
}

@QueryHandler(GetLessonReaderContentQuery)
export class GetLessonReaderContentHandler implements IQueryHandler<
  GetLessonReaderContentQuery,
  Result<LessonReaderContent, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_VARIANT_MEDIA_REF_REPOSITORY)
    private readonly mediaRefRepo: ILessonVariantMediaRefRepository,
    @Inject(LESSON_VIDEO_CUE_REPOSITORY)
    private readonly cueRepo: ILessonVideoCueRepository,
    @Inject(LESSON_LISTENING_STAGE_REPOSITORY)
    private readonly listeningStageRepo: ILessonListeningStageRepository,
    @Inject(LESSON_PARAGRAPH_TRANSLATION_REPOSITORY)
    private readonly paragraphRepo: ILessonParagraphTranslationRepository,
    @Inject(LESSON_GLOSSARY_MARK_REPOSITORY)
    private readonly glossaryMarkRepo: ILessonGlossaryMarkRepository,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepo: IExerciseRepository,
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly vocabularyItemRepo: IVocabularyItemRepository,
  ) {}

  async execute(
    query: GetLessonReaderContentQuery,
  ): Promise<Result<LessonReaderContent, LessonDomainError>> {
    const lesson = await this.lessonRepo.findById(query.lessonId);
    if (!lesson || lesson.deletedAt !== null) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.kind === LessonKind.LIVE) {
      return Result.ok({
        lessonId: lesson.id,
        kind: lesson.kind,
        title: lesson.title,
        displayTitle: null,
        bodyMarkdown: null,
        mediaIds: [],
        paragraphs: null,
        cues: null,
        transcript: null,
        listeningStages: null,
        glossary: [],
        live: {
          startsAt: lesson.liveStartsAt?.toISOString() ?? null,
          durationMinutes: lesson.liveDurationMinutes,
          joinUrl: lesson.liveJoinUrl,
          capacity: lesson.liveCapacity,
        },
      });
    }

    const publishedVariants = await this.variantRepo.findByLessonId(query.lessonId, true);
    const selected = BestVariantSelectorService.selectBestVariant({
      variants: publishedVariants,
      studentNativeLanguage: query.studentNativeLanguage,
      studentCurrentLevel: query.studentCurrentLevel,
      studentKnownLanguages: query.studentKnownLanguages,
      targetLanguage: lesson.targetLanguage,
    });
    if (!selected) {
      return Result.fail(LessonDomainError.BEST_VARIANT_NOT_FOUND);
    }
    const variant = selected.variant;

    const [mediaRefs, glossaryMarks] = await Promise.all([
      this.mediaRefRepo.findByVariantId(variant.id),
      this.glossaryMarkRepo.findByVariantId(variant.id),
    ]);

    const [paragraphs, cues, listeningStages] = await Promise.all([
      lesson.kind === LessonKind.TEXT
        ? this.resolveParagraphs(variant.id, variant.bodyMarkdown)
        : Promise.resolve(null),
      lesson.kind === LessonKind.VIDEO ? this.resolveCues(variant.id) : Promise.resolve(null),
      lesson.kind === LessonKind.AUDIO
        ? this.resolveListeningStages(variant.id)
        : Promise.resolve(null),
    ]);

    const glossary = await this.resolveGlossary(
      glossaryMarks.map((m) => m.vocabularyItemId),
      query.studentNativeLanguage,
    );

    return Result.ok({
      lessonId: lesson.id,
      kind: lesson.kind,
      title: lesson.title,
      displayTitle: variant.displayTitle,
      bodyMarkdown: lesson.kind === LessonKind.TEXT ? variant.bodyMarkdown : null,
      mediaIds: mediaRefs.map((m) => m.mediaId),
      paragraphs,
      cues,
      transcript: lesson.kind === LessonKind.AUDIO ? variant.transcript : null,
      listeningStages,
      glossary,
      live: null,
    });
  }

  private async resolveParagraphs(
    variantId: string,
    bodyMarkdown: string,
  ): Promise<ReaderParagraph[]> {
    const paragraphs = MarkdownParagraphSplitterService.split(bodyMarkdown);
    const translations = await this.paragraphRepo.findByVariantId(variantId);
    const translationByIndex = new Map(translations.map((t) => [t.paragraphIndex, t.translation]));
    return paragraphs.map((target, index) => ({
      target,
      translation: translationByIndex.get(index) ?? null,
    }));
  }

  private async resolveCues(variantId: string): Promise<ReaderVideoCue[]> {
    const cues = await this.cueRepo.findByVariantId(variantId);
    return cues
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        position: c.position,
        startSeconds: c.startSeconds,
        targetLine: c.targetLine,
        translationLine: c.translationLine,
      }));
  }

  private async resolveListeningStages(variantId: string): Promise<ReaderListeningStage[]> {
    const stages = await this.listeningStageRepo.findByVariantId(variantId);
    const sorted = stages.slice().sort((a, b) => a.position - b.position);

    const exercises = await Promise.all(
      sorted.map((s) => this.exerciseRepo.findById(s.exerciseId, true)),
    );

    return sorted.map((stage, index) => {
      const exercise = exercises[index];
      return {
        position: stage.position,
        stageType: stage.stageType,
        exercise:
          exercise && exercise.deletedAt === null
            ? {
                id: exercise.id,
                templateCode: exercise.templateCode,
                content: exercise.content,
                instructions: (exercise.instructions ?? []).map((i) => ({
                  language: i.instructionLanguage,
                  text: i.instructionText,
                  hint: i.hintText,
                })),
              }
            : null,
      };
    });
  }

  private async resolveGlossary(
    vocabularyItemIds: string[],
    language: string,
  ): Promise<ReaderGlossaryEntry[]> {
    if (vocabularyItemIds.length === 0) return [];

    const items = await this.vocabularyItemRepo.findByIds(vocabularyItemIds, true);

    return items.map((item) => {
      const translation = item.translations.find((t) => t.translationLanguage === language) ?? null;
      return {
        id: item.id,
        word: item.word,
        partOfSpeech: item.partOfSpeech,
        translation: translation
          ? {
              language: translation.translationLanguage,
              text: translation.primaryTranslation,
              definition: translation.definition,
            }
          : null,
      };
    });
  }
}
