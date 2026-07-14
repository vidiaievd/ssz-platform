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

    const [items, localizations, sections] = await Promise.all([
      this.prisma.containerItem.findMany({
        where: { containerVersionId: query.versionId },
        select: { id: true, itemType: true, itemId: true, sectionId: true },
      }),
      this.prisma.containerLocalization.findMany({
        where: { containerId: version.containerId },
        select: { languageCode: true },
      }),
      this.prisma.containerSection.findMany({
        where: { containerVersionId: query.versionId },
        select: { id: true, title: true },
      }),
    ]);

    const blockers: RuleViolation[] = [];
    const warnings: RuleViolation[] = [];

    const byType = groupBy(items, (i) => i.itemType);

    await Promise.all([
      this.checkLessons(byType['LESSON'] ?? [], blockers),
      this.checkVocabularyLists(byType['VOCABULARY_LIST'] ?? [], blockers, warnings),
      this.checkExercises(byType['EXERCISE'] ?? [], blockers),
      this.checkModules(byType['CONTAINER'] ?? [], blockers),
    ]);

    // SECTION_EMPTY: a section in this version has no items assigned to it.
    const itemsBySection = groupBy(
      items.filter((i) => i.sectionId),
      (i) => i.sectionId as string,
    );
    for (const section of sections) {
      if ((itemsBySection[section.id] ?? []).length === 0) {
        blockers.push({
          ruleCode: 'SECTION_EMPTY',
          severity: 'blocker',
          itemType: 'SECTION',
          itemId: section.id,
          detail: `Section "${section.title}" has no items`,
        });
      }
    }

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
          transcript: true,
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

      // AUDIO_NO_TRACK / AUDIO_NO_TRANSCRIPT: AUDIO-kind lesson missing its audio
      // source or transcript in the published variant.
      if (kindByLesson.get(item.itemId) === 'AUDIO') {
        const hasAudioSource = variants.some((v) =>
          v.mediaRefs.some((ref) => ref.mediaType === 'AUDIO'),
        );
        if (!hasAudioSource) {
          blockers.push({
            ruleCode: 'AUDIO_NO_TRACK',
            severity: 'blocker',
            itemType: 'LESSON',
            itemId: item.itemId,
            detail: 'Audio lesson has no audio track in its published variant',
          });
        }

        const hasTranscript = variants.some((v) => !!v.transcript?.trim());
        if (!hasTranscript) {
          blockers.push({
            ruleCode: 'AUDIO_NO_TRANSCRIPT',
            severity: 'blocker',
            itemType: 'LESSON',
            itemId: item.itemId,
            detail: 'Audio lesson has no transcript in its published variant',
          });
        }
      }
    }
  }

  private async checkModules(
    items: Array<{ itemType: string; itemId: string }>,
    blockers: RuleViolation[],
  ): Promise<void> {
    if (items.length === 0) return;

    const moduleContainerIds = items.map((i) => i.itemId);

    const moduleContainers = await this.prisma.container.findMany({
      where: { id: { in: moduleContainerIds } },
      select: { id: true, currentPublishedVersionId: true },
    });
    const containerById = new Map(moduleContainers.map((c) => [c.id, c]));

    // Prefer the module's own draft version (what's actually being authored);
    // fall back to its currently published version if no draft exists.
    const draftVersions = await this.prisma.containerVersion.findMany({
      where: { containerId: { in: moduleContainerIds }, status: 'DRAFT' },
      select: { id: true, containerId: true },
    });
    const draftVersionByContainer = new Map(draftVersions.map((v) => [v.containerId, v.id]));

    const resolvedVersionIds = items
      .map(
        (item) =>
          draftVersionByContainer.get(item.itemId) ??
          containerById.get(item.itemId)?.currentPublishedVersionId,
      )
      .filter((id): id is string => !!id);

    const itemCounts = await this.prisma.containerItem.groupBy({
      by: ['containerVersionId'],
      where: { containerVersionId: { in: resolvedVersionIds } },
      _count: { id: true },
    });
    const countByVersion = new Map(itemCounts.map((c) => [c.containerVersionId, c._count.id]));

    for (const item of items) {
      const versionId =
        draftVersionByContainer.get(item.itemId) ??
        containerById.get(item.itemId)?.currentPublishedVersionId;

      // MODULE_EMPTY: module has no resolvable version, or its version has no items.
      if (!versionId || (countByVersion.get(versionId) ?? 0) === 0) {
        blockers.push({
          ruleCode: 'MODULE_EMPTY',
          severity: 'blocker',
          itemType: 'CONTAINER',
          itemId: item.itemId,
          detail: 'Module has no items',
        });
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
