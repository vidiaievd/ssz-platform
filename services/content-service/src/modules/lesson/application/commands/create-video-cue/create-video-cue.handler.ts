import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateVideoCueCommand } from './create-video-cue.command.js';
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

export interface CreateVideoCueResult {
  cueId: string;
}

@CommandHandler(CreateVideoCueCommand)
export class CreateVideoCueHandler implements ICommandHandler<
  CreateVideoCueCommand,
  Result<CreateVideoCueResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
    @Inject(LESSON_CONTENT_VARIANT_REPOSITORY)
    private readonly variantRepo: ILessonContentVariantRepository,
    @Inject(LESSON_VIDEO_CUE_REPOSITORY)
    private readonly cueRepo: ILessonVideoCueRepository,
  ) {}

  async execute(
    command: CreateVideoCueCommand,
  ): Promise<Result<CreateVideoCueResult, LessonDomainError>> {
    const variant = await this.variantRepo.findById(command.variantId);
    if (!variant) {
      return Result.fail(LessonDomainError.VARIANT_NOT_FOUND);
    }

    const lesson = await this.lessonRepo.findById(variant.lessonId);
    if (!lesson) {
      return Result.fail(LessonDomainError.LESSON_NOT_FOUND);
    }

    if (lesson.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check.
      return Result.fail(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    }

    if (lesson.kind !== LessonKind.VIDEO) {
      return Result.fail(LessonDomainError.LESSON_KIND_MISMATCH);
    }

    const existing = await this.cueRepo.findByVariantAndPosition(
      command.variantId,
      command.position,
    );
    if (existing) {
      return Result.fail(LessonDomainError.DUPLICATE_CUE_POSITION);
    }

    const cueResult = LessonVideoCueEntity.create({
      lessonContentVariantId: command.variantId,
      position: command.position,
      startSeconds: command.startSeconds,
      targetLine: command.targetLine,
      translationLine: command.translationLine,
    });

    if (cueResult.isFail) {
      return Result.fail(cueResult.error);
    }

    const cue = await this.cueRepo.save(cueResult.value);

    return Result.ok({ cueId: cue.id });
  }
}
