import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateLessonCommand } from './create-lesson.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LESSON_REPOSITORY } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';

export interface CreateLessonResult {
  lessonId: string;
}

@CommandHandler(CreateLessonCommand)
export class CreateLessonHandler implements ICommandHandler<
  CreateLessonCommand,
  Result<CreateLessonResult, LessonDomainError>
> {
  constructor(
    @Inject(LESSON_REPOSITORY)
    private readonly lessonRepo: ILessonRepository,
  ) {}

  async execute(
    command: CreateLessonCommand,
  ): Promise<Result<CreateLessonResult, LessonDomainError>> {
    const lessonResult = LessonEntity.create({
      targetLanguage: command.targetLanguage,
      difficultyLevel: command.difficultyLevel,
      title: command.title,
      description: command.description,
      coverImageMediaId: command.coverImageMediaId,
      ownerUserId: command.userId,
      ownerSchoolId: command.ownerSchoolId,
      visibility: command.visibility,
    });

    if (lessonResult.isFail) {
      return Result.fail(lessonResult.error);
    }

    const lesson = lessonResult.value;
    await this.lessonRepo.save(lesson);

    return Result.ok({ lessonId: lesson.id });
  }
}
