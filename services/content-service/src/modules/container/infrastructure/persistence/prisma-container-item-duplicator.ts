import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../../../../generated/prisma/client.js';
import type { ContainerItem } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  CopiedExercise,
  CopiedLesson,
  CopiedLessonVariant,
  DuplicateRowInput,
  DuplicatedExercise,
  DuplicatedLesson,
  DuplicatedModule,
  DuplicatedRow,
  IContainerItemDuplicator,
} from '../../application/ports/container-item-duplicator.port.js';
import { getDefaultAccessTier } from '../../domain/value-objects/access-tier.vo.js';
import { domainAccessTierToPrisma, domainVisibilityToPrisma } from './mappers/enum-converters.js';

type Tx = Prisma.TransactionClient;
type RelatableType = 'EXERCISE' | 'LESSON' | 'CONTAINER';

/** A nullable JSON column read back as null is written as JSON null, as the mappers do. */
function json(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

/** The copies made, without the sources that turned out to be deleted. */
function copiedOnly<T>(copies: Map<string, T | null>): T[] {
  return [...copies.values()].filter((copy): copy is T => copy !== null);
}

/**
 * The copy as plain inserts inside one interactive transaction. There is no decision to
 * make per column — a duplicate is the source with new ids and a new owner — so going
 * through the exercise and lesson entities would only add a round-trip per child table.
 */
@Injectable()
export class PrismaContainerItemDuplicator implements IContainerItemDuplicator {
  constructor(private readonly prisma: PrismaService) {}

  async duplicateExerciseRow(input: DuplicateRowInput): Promise<DuplicatedExercise | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.findRow(tx, input, 'EXERCISE');
      if (!row) return null;

      const copy = await this.copyExercise(tx, row.itemId, input);
      if (!copy) return null;

      const placed = await this.placeAfter(tx, row, copy.exerciseId);
      return { ...placed, ...copy };
    });
  }

  async duplicateLessonRow(input: DuplicateRowInput): Promise<DuplicatedLesson | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.findRow(tx, input, 'LESSON');
      if (!row) return null;

      const exerciseCopies = new Map<string, CopiedExercise | null>();
      const copy = await this.copyLesson(tx, row.itemId, input, exerciseCopies);
      if (!copy) return null;

      const placed = await this.placeAfter(tx, row, copy.lessonId);
      return { ...placed, ...copy, exercises: copiedOnly(exerciseCopies) };
    });
  }

  async duplicateModuleRow(input: DuplicateRowInput): Promise<DuplicatedModule | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await this.findRow(tx, input, 'CONTAINER');
        if (!row) return null;

        const source = await tx.container.findFirst({
          where: { id: row.itemId, containerType: 'MODULE', deletedAt: null },
          include: { localizations: true },
        });
        if (!source) return null;

        // The version the structure editor shows: the draft, else the published one —
        // `version_status` sorts in declaration order, draft first.
        const sourceVersion = await tx.containerVersion.findFirst({
          where: { containerId: source.id, status: { in: ['DRAFT', 'PUBLISHED'] } },
          orderBy: [{ status: 'asc' }, { versionNumber: 'desc' }],
          include: {
            sections: { orderBy: { position: 'asc' } },
            items: { orderBy: { position: 'asc' } },
          },
        });

        const visibility = domainVisibilityToPrisma(input.visibility);
        const containerId = randomUUID();
        await tx.container.create({
          data: {
            id: containerId,
            // Unique among live containers and handed out on publish.
            slug: null,
            containerType: source.containerType,
            targetLanguage: source.targetLanguage,
            difficultyLevel: source.difficultyLevel,
            title: source.title,
            description: source.description,
            coverImageMediaId: source.coverImageMediaId,
            ownerUserId: input.userId,
            ownerSchoolId: input.ownerSchoolId,
            visibility,
            // The source's tier fits its own visibility; under another one it takes the
            // default a new container of that visibility would.
            accessTier:
              source.visibility === visibility
                ? source.accessTier
                : domainAccessTierToPrisma(getDefaultAccessTier(input.visibility)),
            levelSystem: source.levelSystem,
            gatingMode: source.gatingMode,
            reviewRespondWithinHours: source.reviewRespondWithinHours,
            coverageRecipe: json(source.coverageRecipe),
          },
        });

        if (source.localizations.length > 0) {
          await tx.containerLocalization.createMany({
            data: source.localizations.map((localization) => ({
              containerId,
              languageCode: localization.languageCode,
              title: localization.title,
              description: localization.description,
              createdByUserId: input.userId,
            })),
          });
        }

        // `module TARGETS can_do_descriptor` and the like.
        await this.copyRelations(tx, 'CONTAINER', source.id, containerId, input.userId);

        const versionId = randomUUID();
        await tx.containerVersion.create({
          data: {
            id: versionId,
            containerId,
            versionNumber: 1,
            status: 'DRAFT',
            createdByUserId: input.userId,
          },
        });

        const sectionIds = new Map<string, string>();
        for (const section of sourceVersion?.sections ?? []) {
          const sectionId = randomUUID();
          sectionIds.set(section.id, sectionId);
          await tx.containerSection.create({
            data: {
              id: sectionId,
              containerVersionId: versionId,
              title: section.title,
              position: section.position,
            },
          });
        }

        const exerciseCopies = new Map<string, CopiedExercise | null>();
        const lessonCopies = new Map<string, CopiedLesson | null>();
        const rows: Prisma.ContainerItemCreateManyInput[] = [];
        for (const item of sourceVersion?.items ?? []) {
          let itemId: string | null = item.itemId;
          if (item.itemType === 'EXERCISE') {
            itemId =
              (await this.copyExerciseOnce(tx, item.itemId, input, exerciseCopies))?.exerciseId ??
              null;
          } else if (item.itemType === 'LESSON') {
            if (!lessonCopies.has(item.itemId)) {
              lessonCopies.set(
                item.itemId,
                await this.copyLesson(tx, item.itemId, input, exerciseCopies),
              );
            }
            itemId = lessonCopies.get(item.itemId)?.lessonId ?? null;
          }
          if (!itemId) continue;

          rows.push({
            containerVersionId: versionId,
            position: item.position,
            itemType: item.itemType,
            itemId,
            isRequired: item.isRequired,
            sectionId: item.sectionId ? (sectionIds.get(item.sectionId) ?? null) : null,
            sectionLabel: item.sectionLabel,
            xpReward: item.xpReward,
          });
        }
        if (rows.length > 0) {
          await tx.containerItem.createMany({ data: rows });
        }

        const placed = await this.placeAfter(tx, row, containerId);
        return {
          ...placed,
          containerId,
          versionId,
          title: source.title,
          targetLanguage: source.targetLanguage,
          lessons: copiedOnly(lessonCopies),
          exercises: copiedOnly(exerciseCopies),
        };
      },
      // A module is a few hundred inserts; the default 5 s is sized for a single entity.
      { timeout: 60_000 },
    );
  }

  /**
   * Re-read inside the transaction: the position the copy goes after is the one the row
   * holds now, not the one the handler saw.
   */
  private findRow(
    tx: Tx,
    input: DuplicateRowInput,
    itemType: 'EXERCISE' | 'LESSON' | 'CONTAINER',
  ): Promise<ContainerItem | null> {
    return tx.containerItem.findFirst({
      where: { id: input.rowId, containerVersionId: input.versionId, itemType },
    });
  }

  /**
   * The lesson with every live variant and its children under the new owner, or null
   * when it is deleted. Stage exercises go through `exerciseCopies`, so one exercise used
   * by two stages — or by a stage and a module row — stays one exercise in the copy.
   */
  private async copyLesson(
    tx: Tx,
    sourceId: string,
    input: DuplicateRowInput,
    exerciseCopies: Map<string, CopiedExercise | null>,
  ): Promise<CopiedLesson | null> {
    const source = await tx.lesson.findFirst({
      where: { id: sourceId, deletedAt: null },
      include: {
        variants: {
          where: { deletedAt: null },
          include: {
            mediaRefs: true,
            videoCues: true,
            videoQuestion: true,
            listeningStages: true,
            paragraphTranslations: true,
            glossaryMarks: true,
            textSpans: true,
          },
        },
      },
    });
    if (!source) return null;

    const lessonId = randomUUID();
    await tx.lesson.create({
      data: {
        id: lessonId,
        targetLanguage: source.targetLanguage,
        difficultyLevel: source.difficultyLevel,
        // Unique among live lessons and handed out on publish: the copy gets its own
        // when it is published as a lesson of its own, if ever.
        slug: null,
        title: source.title,
        description: source.description,
        coverImageMediaId: source.coverImageMediaId,
        ownerUserId: input.userId,
        ownerSchoolId: input.ownerSchoolId,
        visibility: domainVisibilityToPrisma(input.visibility),
        kind: source.kind,
        liveStartsAt: source.liveStartsAt,
        liveDurationMinutes: source.liveDurationMinutes,
        liveJoinUrl: source.liveJoinUrl,
        liveCapacity: source.liveCapacity,
      },
    });

    const copyStageExercise = async (exerciseId: string): Promise<string | null> =>
      (await this.copyExerciseOnce(tx, exerciseId, input, exerciseCopies))?.exerciseId ?? null;

    const variants: CopiedLessonVariant[] = [];
    for (const variant of source.variants) {
      const variantId = randomUUID();
      // The status travels with the body: the body is not versioned (a published
      // variant is the live text), so a copy reset to draft would show the student
      // nothing once the module is published.
      await tx.lessonContentVariant.create({
        data: {
          id: variantId,
          lessonId,
          explanationLanguage: variant.explanationLanguage,
          minLevel: variant.minLevel,
          maxLevel: variant.maxLevel,
          displayTitle: variant.displayTitle,
          displayDescription: variant.displayDescription,
          bodyMarkdown: variant.bodyMarkdown,
          estimatedReadingMinutes: variant.estimatedReadingMinutes,
          transcript: variant.transcript,
          status: variant.status,
          publishedAt: variant.publishedAt,
          createdByUserId: input.userId,
          lastEditedByUserId: input.userId,
        },
      });
      variants.push({
        variantId,
        explanationLanguage: variant.explanationLanguage,
        minLevel: variant.minLevel,
        maxLevel: variant.maxLevel,
      });

      if (variant.mediaRefs.length > 0) {
        await tx.lessonVariantMediaRef.createMany({
          data: variant.mediaRefs.map((ref) => ({
            lessonContentVariantId: variantId,
            mediaId: ref.mediaId,
            mediaType: ref.mediaType,
            positionInText: ref.positionInText,
            extractedAt: ref.extractedAt,
          })),
        });
      }

      if (variant.videoCues.length > 0) {
        await tx.lessonVideoCue.createMany({
          data: variant.videoCues.map((cue) => ({
            lessonContentVariantId: variantId,
            position: cue.position,
            startSeconds: cue.startSeconds,
            targetLine: cue.targetLine,
            translationLine: cue.translationLine,
          })),
        });
      }

      if (variant.paragraphTranslations.length > 0) {
        await tx.lessonParagraphTranslation.createMany({
          data: variant.paragraphTranslations.map((translation) => ({
            lessonContentVariantId: variantId,
            paragraphIndex: translation.paragraphIndex,
            translation: translation.translation,
          })),
        });
      }

      if (variant.glossaryMarks.length > 0) {
        await tx.lessonVariantGlossaryMark.createMany({
          data: variant.glossaryMarks.map((mark) => ({
            lessonContentVariantId: variantId,
            vocabularyItemId: mark.vocabularyItemId,
            occurrenceCount: mark.occurrenceCount,
          })),
        });
      }

      if (variant.textSpans.length > 0) {
        await tx.lessonTextSpan.createMany({
          data: variant.textSpans.map((span) => ({
            lessonContentVariantId: variantId,
            paragraphIndex: span.paragraphIndex,
            charStart: span.charStart,
            charEnd: span.charEnd,
            kind: span.kind,
            refId: span.refId,
            textSnapshot: span.textSnapshot,
            note: span.note,
            createdByUserId: input.userId,
          })),
        });
      }

      // A stage whose exercise is deleted is dropped rather than pointed at the
      // original's: the reader already skips it, and positions need not be dense.
      const stages: Prisma.LessonListeningStageCreateManyInput[] = [];
      for (const stage of variant.listeningStages) {
        const exerciseId = await copyStageExercise(stage.exerciseId);
        if (!exerciseId) continue;
        stages.push({
          lessonContentVariantId: variantId,
          exerciseId,
          position: stage.position,
          stageType: stage.stageType,
        });
      }
      if (stages.length > 0) {
        await tx.lessonListeningStage.createMany({ data: stages });
      }

      if (variant.videoQuestion) {
        const exerciseId = await copyStageExercise(variant.videoQuestion.exerciseId);
        if (exerciseId) {
          await tx.lessonVideoQuestion.create({
            data: { lessonContentVariantId: variantId, exerciseId },
          });
        }
      }
    }

    await this.copyRelations(tx, 'LESSON', source.id, lessonId, input.userId);

    return { lessonId, targetLanguage: source.targetLanguage, variants };
  }

  /** `copyExercise`, at most once per source exercise across one duplicate. */
  private async copyExerciseOnce(
    tx: Tx,
    sourceId: string,
    input: DuplicateRowInput,
    exerciseCopies: Map<string, CopiedExercise | null>,
  ): Promise<CopiedExercise | null> {
    if (!exerciseCopies.has(sourceId)) {
      exerciseCopies.set(sourceId, await this.copyExercise(tx, sourceId, input));
    }
    return exerciseCopies.get(sourceId) ?? null;
  }

  /** The exercise with its children under the new owner, or null when it is deleted. */
  private async copyExercise(
    tx: Tx,
    sourceId: string,
    input: DuplicateRowInput,
  ): Promise<CopiedExercise | null> {
    const source = await tx.exercise.findFirst({
      where: { id: sourceId, deletedAt: null },
      include: {
        template: { select: { code: true } },
        instructions: true,
        itemTargets: true,
      },
    });
    if (!source) return null;

    const exerciseId = randomUUID();
    await tx.exercise.create({
      data: {
        id: exerciseId,
        exerciseTemplateId: source.exerciseTemplateId,
        title: source.title,
        targetLanguage: source.targetLanguage,
        difficultyLevel: source.difficultyLevel,
        content: source.content as Prisma.InputJsonValue,
        expectedAnswers: source.expectedAnswers as Prisma.InputJsonValue,
        answerCheckSettings: json(source.answerCheckSettings),
        // The unreleased edit travels with the copy: the author duplicates what the
        // builder shows them, and publishing the module releases it as it would the
        // original's.
        draftContent: json(source.draftContent),
        draftExpectedAnswers: json(source.draftExpectedAnswers),
        draftAnswerCheckSettings: json(source.draftAnswerCheckSettings),
        draftUpdatedAt: source.draftUpdatedAt,
        skillsOverride: source.skillsOverride,
        focusOverride: source.focusOverride,
        overrideSetAt: source.overrideSetAt,
        ownerUserId: input.userId,
        ownerSchoolId: input.ownerSchoolId,
        visibility: domainVisibilityToPrisma(input.visibility),
        estimatedDurationSeconds: source.estimatedDurationSeconds,
      },
    });

    if (source.instructions.length > 0) {
      await tx.exerciseInstruction.createMany({
        data: source.instructions.map((instruction) => ({
          exerciseId,
          instructionLanguage: instruction.instructionLanguage,
          instructionText: instruction.instructionText,
          hintText: instruction.hintText,
          textOverrides: json(instruction.textOverrides),
          draftInstructionText: instruction.draftInstructionText,
          draftHintText: instruction.draftHintText,
          draftTextOverrides: json(instruction.draftTextOverrides),
          draftUpdatedAt: instruction.draftUpdatedAt,
        })),
      });
    }

    if (source.itemTargets.length > 0) {
      await tx.exerciseItemTarget.createMany({
        data: source.itemTargets.map((target) => ({
          exerciseId,
          itemKey: target.itemKey,
          atomType: target.atomType,
          atomId: target.atomId,
          role: target.role,
          createdByUserId: input.userId,
        })),
      });
    }

    // `vocabulary_item / grammar_rule PRACTICED_BY exercise`: what coverage, the
    // target suggestions and the related-exercise reads know the exercise by. Without
    // them the copy would train the same words and count towards none of them.
    await this.copyRelations(tx, 'EXERCISE', source.id, exerciseId, input.userId);

    return {
      exerciseId,
      templateCode: source.template.code,
      targetLanguage: source.targetLanguage,
    };
  }

  /** Every relation edge touching the source, re-pointed at the copy. */
  private async copyRelations(
    tx: Tx,
    type: RelatableType,
    sourceId: string,
    copyId: string,
    userId: string,
  ): Promise<void> {
    const relations = await tx.contentRelation.findMany({
      where: {
        OR: [
          { sourceType: type, sourceId },
          { targetType: type, targetId: sourceId },
        ],
      },
    });
    if (relations.length === 0) return;

    await tx.contentRelation.createMany({
      data: relations.map((relation) => ({
        sourceType: relation.sourceType,
        sourceId:
          relation.sourceType === type && relation.sourceId === sourceId
            ? copyId
            : relation.sourceId,
        targetType: relation.targetType,
        targetId:
          relation.targetType === type && relation.targetId === sourceId
            ? copyId
            : relation.targetId,
        relationKind: relation.relationKind,
        ownerSchoolId: relation.ownerSchoolId,
        createdByUserId: userId,
      })),
      skipDuplicates: true,
    });
  }

  /** A new row for the copy right after `row`, in its section, with its flags. */
  private async placeAfter(tx: Tx, row: ContainerItem, itemId: string): Promise<DuplicatedRow> {
    // `unique(container_version_id, position)` is checked per row as it is written, so
    // a plain `position + 1` collides with the neighbour that has not moved yet: park
    // the tail on negative positions first, then flip it back one further along —
    // -(-p - 1) = p + 1.
    await tx.$executeRaw`
      UPDATE "container_items"
      SET "position" = -"position" - 1
      WHERE "container_version_id" = ${row.containerVersionId}::uuid AND "position" > ${row.position}
    `;
    await tx.$executeRaw`
      UPDATE "container_items"
      SET "position" = -"position"
      WHERE "container_version_id" = ${row.containerVersionId}::uuid AND "position" < 0
    `;

    const position = row.position + 1;
    const copyRow = await tx.containerItem.create({
      data: {
        containerVersionId: row.containerVersionId,
        position,
        itemType: row.itemType,
        itemId,
        isRequired: row.isRequired,
        sectionId: row.sectionId,
        sectionLabel: row.sectionLabel,
        xpReward: row.xpReward,
      },
    });

    return { rowId: copyRow.id, position };
  }
}
