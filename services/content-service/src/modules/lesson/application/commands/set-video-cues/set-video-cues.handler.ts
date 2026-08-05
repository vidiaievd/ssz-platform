import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SetVideoCuesCommand } from './set-video-cues.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonVideoCueEntity } from '../../../domain/entities/lesson-video-cue.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LESSON_CONTENT_VARIANT_REPOSITORY } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import { LESSON_VIDEO_CUE_REPOSITORY } from '../../../domain/repositories/lesson-video-cue.repository.interface.js';
import type { ILessonVideoCueRepository } from '../../../domain/repositories/lesson-video-cue.repository.interface.js';

@CommandHandler(SetVideoCuesCommand)
export class SetVideoCuesHandler implements ICommandHandler<
  SetVideoCuesCommand,
  Result<void, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_VIDEO_CUE_REPOSITORY)
    private readonly cueRepo: ILessonVideoCueRepository,
  ) {}

  async execute(command: SetVideoCuesCommand): Promise<Result<void, LessonDomainError>> {
    const variant = await this.variantRepo.findById(command.variantId);
    if (!variant) {
      return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
    }

    const lesson = await this.lessonRepo.findById(variant.lessonId);
    if (!lesson) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.kind !== LessonKind.VIDEO) {
      return Result.fail(LessonDomainError.LESSON_KIND_MISMATCH);
    }

    const positions = new Set<number>();
    const cues: LessonVideoCueEntity[] = [];
    for (const input of command.cues) {
      if (positions.has(input.position)) {
        return Result.fail(LessonDomainError.DUPLICATE_CUE_POSITION);
      }
      positions.add(input.position);

      const cueResult = LessonVideoCueEntity.create({
        lessonContentVariantId: command.variantId,
        position: input.position,
        startSeconds: input.startSeconds,
        targetLine: input.targetLine,
        translationLine: input.translationLine,
      });
      if (cueResult.isFail) {
        return Result.fail(cueResult.error);
      }
      cues.push(cueResult.value);
    }

    await this.cueRepo.replaceForVariant(command.variantId, cues);

    return Result.ok();
  }
}
