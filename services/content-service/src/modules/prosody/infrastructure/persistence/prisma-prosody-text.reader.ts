import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import type {
  IProsodyTextReader,
  ReadAloudPassages,
} from '../../domain/repositories/prosody-text.reader.interface.js';
import type { ExerciseScope } from '../../domain/prosody-owner.js';
import type { ProsodyError } from '../../domain/prosody-error.js';

const READ_ALOUD = 'read_aloud';

@Injectable()
export class PrismaProsodyTextReader implements IProsodyTextReader {
  constructor(private readonly prisma: PrismaService) {}

  async lessonBody(lessonId: string, variantId: string): Promise<Result<string, ProsodyError>> {
    const variant = await this.prisma.lessonContentVariant.findUnique({
      where: { id: variantId },
      select: {
        lessonId: true,
        bodyMarkdown: true,
        deletedAt: true,
        lesson: { select: { kind: true, deletedAt: true } },
      },
    });
    // A variant of another lesson is "not found": the guard checked `lessonId`, not it.
    if (
      !variant ||
      variant.lessonId !== lessonId ||
      variant.deletedAt !== null ||
      variant.lesson.deletedAt !== null
    ) {
      return Result.fail({ code: 'OWNER_NOT_FOUND' });
    }
    // Prisma enums carry member names, not their @map values.
    if (variant.lesson.kind !== 'TEXT') return Result.fail({ code: 'NOT_A_TEXT_LESSON' });
    return Result.ok(variant.bodyMarkdown);
  }

  async readAloudPassages(
    exerciseId: string,
    scope: ExerciseScope,
  ): Promise<Result<ReadAloudPassages, ProsodyError>> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: {
        content: true,
        draftContent: true,
        draftUpdatedAt: true,
        deletedAt: true,
        template: { select: { code: true } },
      },
    });
    if (!exercise || exercise.deletedAt !== null) return Result.fail({ code: 'OWNER_NOT_FOUND' });
    if (exercise.template.code !== READ_ALOUD) return Result.fail({ code: 'NOT_READ_ALOUD' });

    // Same rule as `ExerciseEntity.authoringContent`: `draft_updated_at` is the flag.
    const content =
      scope === 'draft' && exercise.draftUpdatedAt !== null
        ? exercise.draftContent
        : exercise.content;
    return Result.ok(passagesOf(content));
  }
}

/** The prompts of a read_aloud document, read defensively — it is JSON a builder wrote. */
function passagesOf(content: unknown): ReadAloudPassages {
  const doc = (content ?? {}) as { mode?: unknown; prompts?: unknown };
  const prompts = Array.isArray(doc.prompts) ? doc.prompts : [];
  return {
    mode: typeof doc.mode === 'string' ? doc.mode : null,
    prompts: prompts
      .map((p) => (p ?? {}) as { id?: unknown; text?: unknown })
      .filter((p): p is { id: string; text?: unknown } => typeof p.id === 'string')
      .map((p) => ({ id: p.id, text: typeof p.text === 'string' ? p.text : '' })),
  };
}
