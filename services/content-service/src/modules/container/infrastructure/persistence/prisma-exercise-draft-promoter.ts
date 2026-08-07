import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  IExerciseDraftPromoter,
  PromotedDrafts,
} from '../../application/ports/exercise-draft-promoter.port.js';

/**
 * Promotion as two set-based updates rather than a load-mutate-save loop.
 *
 * A module publishes tens of exercises at once, and the promotion has to be
 * all-or-nothing with the publish that asked for it: reading each row into a
 * domain entity would buy nothing here — there is no decision to make per row,
 * only the copy — and would cost a round-trip each.
 */
@Injectable()
export class PrismaExerciseDraftPromoter implements IExerciseDraftPromoter {
  constructor(private readonly prisma: PrismaService) {}

  async promoteForVersion(versionId: string): Promise<PromotedDrafts> {
    const exerciseIds = await this.reachableExerciseIds(versionId);
    if (exerciseIds.length === 0) return { exercises: 0, instructions: 0 };

    const ids = Prisma.join(exerciseIds.map((id) => Prisma.sql`${id}::uuid`));

    // `draft_updated_at IS NOT NULL` is the guard everywhere: it is what says the
    // sibling columns hold a complete document. Rows without one are left alone,
    // so a second publish is a no-op rather than a rewrite with nulls.
    const exercises = await this.prisma.$executeRaw`
      UPDATE "exercises"
      SET "content" = "draft_content",
          "expected_answers" = "draft_expected_answers",
          "answer_check_settings" = "draft_answer_check_settings",
          "draft_content" = NULL,
          "draft_expected_answers" = NULL,
          "draft_answer_check_settings" = NULL,
          "draft_updated_at" = NULL,
          "updated_at" = NOW()
      WHERE "id" IN (${ids}) AND "draft_updated_at" IS NOT NULL
    `;

    const instructions = await this.prisma.$executeRaw`
      UPDATE "exercise_instructions"
      SET "instruction_text" = "draft_instruction_text",
          "hint_text" = "draft_hint_text",
          "text_overrides" = "draft_text_overrides",
          "draft_instruction_text" = NULL,
          "draft_hint_text" = NULL,
          "draft_text_overrides" = NULL,
          "draft_updated_at" = NULL,
          "updated_at" = NOW()
      WHERE "exercise_id" IN (${ids}) AND "draft_updated_at" IS NOT NULL
    `;

    return { exercises, instructions };
  }

  /**
   * Every exercise this version puts in front of a student: the ones it places
   * itself, plus the ones its lessons embed. A lesson's listening stages and
   * video questions are editable from the same screens and would otherwise keep
   * an edit forever — nothing else would ever publish them.
   */
  private async reachableExerciseIds(versionId: string): Promise<string[]> {
    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: versionId, itemType: { in: ['EXERCISE', 'LESSON'] } },
      select: { itemType: true, itemId: true },
    });

    const direct = items.filter((i) => i.itemType === 'EXERCISE').map((i) => i.itemId);
    const lessonIds = items.filter((i) => i.itemType === 'LESSON').map((i) => i.itemId);

    if (lessonIds.length === 0) return [...new Set(direct)];

    // Both embeds hang off the content variant, not the lesson, so the lesson
    // ids have to become variant ids first.
    const variants = await this.prisma.lessonContentVariant.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { id: true },
    });
    const variantIds = variants.map((v) => v.id);
    if (variantIds.length === 0) return [...new Set(direct)];

    const [stages, questions] = await Promise.all([
      this.prisma.lessonListeningStage.findMany({
        where: { lessonContentVariantId: { in: variantIds } },
        select: { exerciseId: true },
      }),
      this.prisma.lessonVideoQuestion.findMany({
        where: { lessonContentVariantId: { in: variantIds } },
        select: { exerciseId: true },
      }),
    ]);

    const embedded = [...stages, ...questions].map((row) => row.exerciseId);

    return [...new Set([...direct, ...embedded])];
  }
}
