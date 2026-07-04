import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { GetExpandedModuleQuery } from './get-expanded-module.query.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { BestVariantSelectorService } from '../../../../lesson/domain/services/best-variant-selector.service.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../../lesson/domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../../lesson/domain/repositories/lesson-content-variant.repository.interface.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';

export interface VocabItemExpanded {
  id: string;
  word: string;
  partOfSpeech: string | null;
  ipaTranscription: string | null;
  pronunciationAudioMediaId: string | null;
  translation: { language: string; text: string; definition: string | null } | null;
  usageExample: { text: string } | null;
}

export interface GrammarRuleExpanded {
  id: string;
  title: string;
  bodyMarkdown: string | null;
}

export interface ExerciseRef {
  id: string;
  templateCode: string;
  difficultyLevel: string;
}

export interface LessonVariantExpanded {
  id: string;
  explanationLanguage: string;
  minLevel: string;
  maxLevel: string;
  bodyMarkdown: string;
  estimatedReadingMinutes: number | null;
  mediaIds: string[];
}

export interface ExpandedModulePayload {
  moduleId: string;
  moduleTitle: string;
  lesson: LessonVariantExpanded | null;
  vocabItems: VocabItemExpanded[];
  grammarRules: GrammarRuleExpanded[];
  exercises: ExerciseRef[];
}

@QueryHandler(GetExpandedModuleQuery)
export class GetExpandedModuleHandler
  implements IQueryHandler<GetExpandedModuleQuery, ExpandedModulePayload>
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
  ) {}

  async execute(query: GetExpandedModuleQuery): Promise<ExpandedModulePayload> {
    // 1. Load the module container.
    const module = await this.prisma.container.findUnique({
      where: { id: query.moduleId, deletedAt: null },
      select: { id: true, title: true, targetLanguage: true, currentPublishedVersionId: true },
    });
    if (!module) throw new NotFoundException(`Module ${query.moduleId} not found`);

    // 2. Load the published version items.
    const items = module.currentPublishedVersionId
      ? await this.prisma.containerItem.findMany({
          where: { containerVersionId: module.currentPublishedVersionId },
          orderBy: { position: 'asc' },
          select: { itemType: true, itemId: true },
        })
      : [];

    const lessonIds = items.filter((i) => i.itemType === 'LESSON').map((i) => i.itemId);
    const exerciseIds = items.filter((i) => i.itemType === 'EXERCISE').map((i) => i.itemId);

    // 3. INTRODUCES vocab items via ContentRelation.
    const introduceRelations = await this.prisma.contentRelation.findMany({
      where: {
        sourceType: 'CONTAINER',
        sourceId: query.moduleId,
        relationKind: 'INTRODUCES',
        targetType: 'VOCABULARY_ITEM',
      },
    });
    const vocabItemIds = introduceRelations.map((r) => r.targetId);

    // 4. FEATURES grammar rules via ContentRelation.
    const featuresRelations = await this.prisma.contentRelation.findMany({
      where: {
        sourceType: 'CONTAINER',
        sourceId: query.moduleId,
        relationKind: 'FEATURES',
        targetType: 'GRAMMAR_RULE',
      },
    });
    const grammarRuleIds = featuresRelations.map((r) => r.targetId);

    // Run remaining fetches in parallel.
    const [lessonVariant, vocabRows, grammarRows, exerciseRows] = await Promise.all([
      this.getBestLessonVariant(lessonIds[0] ?? null, query.language, query.level, module.targetLanguage),
      this.getVocabItems(vocabItemIds, query.language),
      this.getGrammarRules(grammarRuleIds, query.language),
      this.getExercises(exerciseIds),
    ]);

    return {
      moduleId: module.id,
      moduleTitle: module.title ?? '',
      lesson: lessonVariant,
      vocabItems: vocabRows,
      grammarRules: grammarRows,
      exercises: exerciseRows,
    };
  }

  private async getBestLessonVariant(
    lessonId: string | null,
    language: string,
    level: string,
    targetLanguage: string,
  ): Promise<LessonVariantExpanded | null> {
    if (!lessonId) return null;

    const published = await this.variantRepo.findByLessonId(lessonId, true);

    const selected = BestVariantSelectorService.selectBestVariant({
      variants: published,
      studentNativeLanguage: language,
      studentCurrentLevel: level as DifficultyLevel,
      studentKnownLanguages: [language],
      targetLanguage,
    });

    if (!selected) return null;
    const v = selected.variant;

    const mediaRefs = await this.prisma.lessonVariantMediaRef.findMany({
      where: { lessonContentVariantId: v.id },
      select: { mediaId: true },
    });

    return {
      id: v.id,
      explanationLanguage: v.explanationLanguage,
      minLevel: v.minLevel,
      maxLevel: v.maxLevel,
      bodyMarkdown: v.bodyMarkdown,
      estimatedReadingMinutes: v.estimatedReadingMinutes,
      mediaIds: mediaRefs.map((m) => m.mediaId),
    };
  }

  private async getVocabItems(
    ids: string[],
    language: string,
  ): Promise<VocabItemExpanded[]> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.vocabularyItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: {
        translations: { where: { translationLanguage: language }, take: 1 },
        usageExamples: { orderBy: { position: 'asc' }, take: 1 },
      },
    });

    return rows.map((row) => {
      const t = row.translations[0] ?? null;
      const ex = row.usageExamples[0] ?? null;
      return {
        id: row.id,
        word: row.word,
        partOfSpeech: row.partOfSpeech,
        ipaTranscription: row.ipaTranscription,
        pronunciationAudioMediaId: row.pronunciationAudioMediaId,
        translation: t
          ? { language: t.translationLanguage, text: t.primaryTranslation, definition: t.definition }
          : null,
        usageExample: ex ? { text: ex.exampleText } : null,
      };
    });
  }

  private async getGrammarRules(
    ids: string[],
    language: string,
  ): Promise<GrammarRuleExpanded[]> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.grammarRule.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: {
        explanations: {
          where: { explanationLanguage: language, status: 'PUBLISHED' },
          orderBy: { publishedAt: 'desc' },
          take: 1,
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      bodyMarkdown: row.explanations[0]?.bodyMarkdown ?? null,
    }));
  }

  private async getExercises(ids: string[]): Promise<ExerciseRef[]> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.exercise.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: { template: { select: { code: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      templateCode: row.template.code,
      difficultyLevel: row.difficultyLevel,
    }));
  }
}
