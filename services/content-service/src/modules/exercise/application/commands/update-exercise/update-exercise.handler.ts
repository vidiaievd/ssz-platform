import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateExerciseCommand } from './update-exercise.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { AUDIT_LOG } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IAuditLog } from '../../../../../shared/application/ports/audit-log.port.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_TEMPLATE_REPOSITORY } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import type { ExerciseTemplateEntity } from '../../../../exercise-template/domain/entities/exercise-template.entity.js';

/** What a caller needs in order to keep saving: the token its next write must carry. */
export interface UpdateExerciseResult {
  updatedAt: Date;
}

/**
 * A refused write, carrying the value the caller is behind. The timestamp travels with
 * the error rather than being looked up again by the controller: it is what makes the
 * conflict actionable — the client can offer to reload exactly the version it lost to.
 */
export interface ExerciseModifiedElsewhere {
  code: ExerciseDomainError.EXERCISE_MODIFIED_ELSEWHERE;
  currentUpdatedAt: Date;
}

export type UpdateExerciseError = ExerciseDomainError | ExerciseModifiedElsewhere;

export function isModifiedElsewhere(
  error: UpdateExerciseError,
): error is ExerciseModifiedElsewhere {
  return typeof error === 'object';
}

@CommandHandler(UpdateExerciseCommand)
export class UpdateExerciseHandler implements ICommandHandler<
  UpdateExerciseCommand,
  Result<UpdateExerciseResult, UpdateExerciseError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(AUDIT_LOG)
    private readonly auditLog: IAuditLog,
    @Inject(EXERCISE_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IExerciseTemplateRepository,
  ) {}

  async execute(
    command: UpdateExerciseCommand,
  ): Promise<Result<UpdateExerciseResult, UpdateExerciseError>> {
    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }

    // Optimistic concurrency, opt-in. An editor that autosaves sends the `updatedAt` it
    // last read; every other caller writes unconditionally, as they all did before this
    // existed. Compared as instants rather than strings, so a caller that reformats the
    // timestamp on the way through is not told it is out of date.
    if (command.expectedUpdatedAt !== undefined) {
      const expected = new Date(command.expectedUpdatedAt);
      // Against the *authoring* timestamp: once an edit is waiting in the draft, that
      // is the version an editor last read, and the live row no longer moves at all.
      if (expected.getTime() !== exercise.contentUpdatedAt.getTime()) {
        return Result.fail({
          code: ExerciseDomainError.EXERCISE_MODIFIED_ELSEWHERE,
          currentUpdatedAt: exercise.contentUpdatedAt,
        });
      }
    }

    // Fetch template only when content/answers are being updated (for schema validation).
    let template: ExerciseTemplateEntity | undefined = undefined;
    if (command.content !== undefined || command.expectedAnswers !== undefined) {
      template = (await this.templateRepo.findById(exercise.exerciseTemplateId)) ?? undefined;
    }

    const updateResult = exercise.update(
      {
        difficultyLevel: command.difficultyLevel,
        content: command.content,
        expectedAnswers: command.expectedAnswers,
        answerCheckSettings: command.answerCheckSettings,
        visibility: command.visibility,
        estimatedDurationSeconds: command.estimatedDurationSeconds,
      },
      template,
    );

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    const saved = await this.exerciseRepo.save(exercise);

    await this.auditLog.record({
      entityType: 'EXERCISE',
      entityId: command.exerciseId,
      action: 'updated',
      actorUserId: command.userId,
      changedFields: changedExerciseFields(command),
    });

    // The stored value, not the one the entity set on itself: the row is what the next
    // write is compared against, and a client holding anything else conflicts with itself.
    return Result.ok({ updatedAt: saved.contentUpdatedAt });
  }
}

/**
 * The fields this request set. Taken from the command rather than from the
 * entity's own diff: an author who re-saves a sentence to the same text has
 * still edited it, and a history that hid that would look like lost work.
 */
function changedExerciseFields(command: UpdateExerciseCommand): string[] {
  const fields: Array<keyof UpdateExerciseCommand> = [
    'difficultyLevel',
    'content',
    'expectedAnswers',
    'answerCheckSettings',
    'visibility',
    'estimatedDurationSeconds',
  ];
  return fields.filter((field) => command[field] !== undefined);
}
