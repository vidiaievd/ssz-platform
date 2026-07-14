import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetPreflightQuery } from './get-preflight.query.js';

export type RuleSeverity = 'blocker' | 'warning';

export interface RuleViolation {
  ruleCode: string;
  severity: RuleSeverity;
  itemType: string;
  itemId: string;
  detail: string;
}

export interface PreflightResult {
  versionId: string;
  containerId: string;
  blockers: RuleViolation[];
  warnings: RuleViolation[];
}

// Locales the platform ships with; missing container localizations are warnings.
const SUPPORTED_LOCALES = ['en', 'nb', 'uk', 'ru'];

// Markdown image without alt text: ![](url) — capturing group is the empty alt.
const IMG_NO_ALT_RE = /!\[\s*\]\(/g;

@QueryHandler(GetPreflightQuery)
export class GetPreflightHandler
  implements IQueryHandler<GetPreflightQuery, PreflightResult>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetPreflightQuery): Promise<PreflightResult> {
    const version = await this.prisma.containerVersion.findUnique({
      where: { id: query.versionId },
      select: { id: true, containerId: true },
    });
    if (!version) throw new NotFoundException(`Version ${query.versionId} not found`);

    const [items, localizations] = await Promise.all([
      this.prisma.containerItem.findMany({
        where: { containerVersionId: query.versionId },
        select: { id: true, itemType: true, itemId: true },
      }),
      this.prisma.containerLocalization.findMany({
        where: { containerId: version.containerId },
        select: { languageCode: true },
      }),
    ]);

    const blockers: RuleViolation[] = [];
    const warnings: RuleViolation[] = [];

    const byType = groupBy(items, (i) => i.itemType);

    await Promise.all([
      this.checkLessons(byType['LESSON'] ?? [], blockers),
      this.checkVocabularyLists(byType['VOCABULARY_LIST'] ?? [], blockers, warnings),
      this.checkExercises(byType['EXERCISE'] ?? [], blockers),
    ]);

    // NO_GRAMMAR: no grammar-rule items in this version.
    if ((byType['GRAMMAR_RULE'] ?? []).length === 0) {
      warnings.push({
        ruleCode: 'NO_GRAMMAR',
        severity: 'warning',
        itemType: 'VERSION',
        itemId: query.versionId,
        detail: 'Version has no grammar rule items',
      });
    }

    // EXERCISE_COUNT_LOW: fewer than 4 exercise items.
    const exerciseCount = (byType['EXERCISE'] ?? []).length;
    if (exerciseCount < 4) {
      warnings.push({
        ruleCode: 'EXERCISE_COUNT_LOW',
        severity: 'warning',
        itemType: 'VERSION',
        itemId: query.versionId,
        detail: `Version has ${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} (minimum recommended: 4)`,
      });
    }

    // LOCALE_INCOMPLETE: container is missing localizations for some platform locales.
    const existingLocales = new Set(localizations.map((l) => l.languageCode));
    const missingLocales = SUPPORTED_LOCALES.filter((l) => !existingLocales.has(l));
    if (missingLocales.length > 0) {
      warnings.push({
        ruleCode: 'LOCALE_INCOMPLETE',
        severity: 'warning',
        itemType: 'CONTAINER',
        itemId: version.containerId,
        detail: `Missing localizations for: ${missingLocales.join(', ')}`,
      });
    }

    return { versionId: query.versionId, containerId: version.containerId, blockers, warnings };
  }

  private async checkLessons(
    items: Array<{ itemType: string; itemId: string }>,
    blockers: RuleViolation[],
  ): Promise<void> {
    if (items.length === 0) return;

    const lessonIds = items.map((i) => i.itemId);

    const [lessons, publishedVariants] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { id: { in: lessonIds } },
        select: { id: true, kind: true },
      }),
      // Load all PUBLISHED variants for these lessons in one query.
      this.prisma.lessonContentVariant.findMany({
        where: {
          lessonId: { in: lessonIds },
          status: 'PUBLISHED',
          deletedAt: null,
        },
        select: {
          id: true,
          lessonId: true,
          bodyMarkdown: true,
          mediaRefs: { select: { mediaType: true } },
        },
      }),
    ]);

    const kindByLesson = new Map(lessons.map((l) => [l.id, l.kind]));
    const variantsByLesson = groupBy(publishedVariants, (v) => v.lessonId);

    for (const item of items) {
      const variants = variantsByLesson[item.itemId] ?? [];

      // READ_NO_TITLE: lesson has no published variant — students see nothing.
      if (variants.length === 0) {
        blockers.push({
          ruleCode: 'READ_NO_TITLE',
          severity: 'blocker',
          itemType: 'LESSON',
          itemId: item.itemId,
          detail: 'Lesson has no published variant',
        });
        continue;
      }

      // MEDIA_NO_ALT: any published variant body contains an image without alt text.
      for (const variant of variants) {
        if (IMG_NO_ALT_RE.test(variant.bodyMarkdown)) {
          IMG_NO_ALT_RE.lastIndex = 0; // reset stateful regex
          blockers.push({
            ruleCode: 'MEDIA_NO_ALT',
            severity: 'blocker',
            itemType: 'LESSON',
            itemId: item.itemId,
            detail: 'Lesson variant contains image(s) without alt text',
          });
          break;
        }
        IMG_NO_ALT_RE.lastIndex = 0;
      }

      // VIDEO_NO_SOURCE: VIDEO-kind lesson has no published variant with a video media ref.
      if (kindByLesson.get(item.itemId) === 'VIDEO') {
        const hasVideoSource = variants.some((v) =>
          v.mediaRefs.some((ref) => ref.mediaType === 'VIDEO'),
        );
        if (!hasVideoSource) {
          blockers.push({
            ruleCode: 'VIDEO_NO_SOURCE',
            severity: 'blocker',
            itemType: 'LESSON',
            itemId: item.itemId,
            detail: 'Video lesson has no video source in its published variant',
          });
        }
      }
    }
  }

  private async checkVocabularyLists(
    items: Array<{ itemType: string; itemId: string }>,
    blockers: RuleViolation[],
    warnings: RuleViolation[],
  ): Promise<void> {
    if (items.length === 0) return;

    const listIds = items.map((i) => i.itemId);

    const vocabItems = await this.prisma.vocabularyItem.findMany({
      where: { vocabularyListId: { in: listIds }, deletedAt: null },
      select: {
        id: true,
        vocabularyListId: true,
        pronunciationAudioMediaId: true,
        translations: { select: { id: true } },
      },
    });

    for (const item of vocabItems) {
      // VOCAB_NO_TRANSLATION: item has no translation in any language.
      if (item.translations.length === 0) {
        blockers.push({
          ruleCode: 'VOCAB_NO_TRANSLATION',
          severity: 'blocker',
          itemType: 'VOCABULARY_ITEM',
          itemId: item.id,
          detail: 'Vocabulary item has no translations',
        });
      }

      // VOCAB_NO_AUDIO: item has no pronunciation audio.
      if (!item.pronunciationAudioMediaId) {
        warnings.push({
          ruleCode: 'VOCAB_NO_AUDIO',
          severity: 'warning',
          itemType: 'VOCABULARY_ITEM',
          itemId: item.id,
          detail: 'Vocabulary item has no pronunciation audio',
        });
      }
    }
  }

  private async checkExercises(
    items: Array<{ itemType: string; itemId: string }>,
    blockers: RuleViolation[],
  ): Promise<void> {
    if (items.length === 0) return;

    const exerciseIds = items.map((i) => i.itemId);

    const instructions = await this.prisma.exerciseInstruction.findMany({
      where: { exerciseId: { in: exerciseIds } },
      select: { exerciseId: true },
    });

    const instructionsByExercise = new Set(instructions.map((i) => i.exerciseId));

    for (const item of items) {
      if (!instructionsByExercise.has(item.itemId)) {
        blockers.push({
          ruleCode: 'EXERCISE_INCOMPLETE',
          severity: 'blocker',
          itemType: 'EXERCISE',
          itemId: item.itemId,
          detail: 'Exercise has no instruction text',
        });
      }
    }
  }
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}
