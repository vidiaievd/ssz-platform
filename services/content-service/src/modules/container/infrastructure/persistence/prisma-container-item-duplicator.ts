import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  DuplicateRowInput,
  DuplicatedExercise,
  IContainerItemDuplicator,
} from '../../application/ports/container-item-duplicator.port.js';
import { domainVisibilityToPrisma } from './mappers/enum-converters.js';

/** A nullable JSON column read back as null is written as JSON null, as the mappers do. */
function json(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

/**
 * The copy as plain inserts inside one interactive transaction. There is no decision to
 * make per column — a duplicate is the source with new ids and a new owner — so going
 * through the exercise entity would only add a round-trip per child table.
 */
@Injectable()
export class PrismaContainerItemDuplicator implements IContainerItemDuplicator {
  constructor(private readonly prisma: PrismaService) {}

  async duplicateExerciseRow(input: DuplicateRowInput): Promise<DuplicatedExercise | null> {
    return this.prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: the position the copy goes after is the one
      // the row holds now, not the one the handler saw.
      const row = await tx.containerItem.findFirst({
        where: { id: input.rowId, containerVersionId: input.versionId, itemType: 'EXERCISE' },
      });
      if (!row) return null;

      const source = await tx.exercise.findFirst({
        where: { id: row.itemId, deletedAt: null },
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
      const relations = await tx.contentRelation.findMany({
        where: {
          OR: [
            { sourceType: 'EXERCISE', sourceId: source.id },
            { targetType: 'EXERCISE', targetId: source.id },
          ],
        },
      });
      if (relations.length > 0) {
        await tx.contentRelation.createMany({
          data: relations.map((relation) => ({
            sourceType: relation.sourceType,
            sourceId:
              relation.sourceType === 'EXERCISE' && relation.sourceId === source.id
                ? exerciseId
                : relation.sourceId,
            targetType: relation.targetType,
            targetId:
              relation.targetType === 'EXERCISE' && relation.targetId === source.id
                ? exerciseId
                : relation.targetId,
            relationKind: relation.relationKind,
            ownerSchoolId: relation.ownerSchoolId,
            createdByUserId: input.userId,
          })),
          skipDuplicates: true,
        });
      }

      // Make room right after the row. `unique(container_version_id, position)` is
      // checked per row as it is written, so a plain `position + 1` collides with the
      // neighbour that has not moved yet: park the tail on negative positions first,
      // then flip it back one further along — -(-p - 1) = p + 1.
      await tx.$executeRaw`
        UPDATE "container_items"
        SET "position" = -"position" - 1
        WHERE "container_version_id" = ${input.versionId}::uuid AND "position" > ${row.position}
      `;
      await tx.$executeRaw`
        UPDATE "container_items"
        SET "position" = -"position"
        WHERE "container_version_id" = ${input.versionId}::uuid AND "position" < 0
      `;

      const position = row.position + 1;
      const copyRow = await tx.containerItem.create({
        data: {
          containerVersionId: input.versionId,
          position,
          itemType: 'EXERCISE',
          itemId: exerciseId,
          isRequired: row.isRequired,
          sectionId: row.sectionId,
          sectionLabel: row.sectionLabel,
          xpReward: row.xpReward,
        },
      });

      return {
        rowId: copyRow.id,
        position,
        exerciseId,
        templateCode: source.template.code,
        targetLanguage: source.targetLanguage,
      };
    });
  }
}
