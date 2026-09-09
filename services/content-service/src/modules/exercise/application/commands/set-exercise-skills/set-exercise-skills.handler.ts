import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { DerivedProfile } from '@ssz/shared-kernel/skills';
import { SetExerciseSkillsCommand } from './set-exercise-skills.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { AUDIT_LOG } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IAuditLog } from '../../../../../shared/application/ports/audit-log.port.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_AXES } from '../../../../../shared/skills/domain/exercise-axes.port.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';

@CommandHandler(SetExerciseSkillsCommand)
export class SetExerciseSkillsHandler implements ICommandHandler<
  SetExerciseSkillsCommand,
  Result<DerivedProfile, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(AUDIT_LOG)
    private readonly auditLog: IAuditLog,
    @Inject(EXERCISE_AXES)
    private readonly axes: IExerciseAxes,
  ) {}

  /**
   * Returns what the exercise now trains, not what was stored.
   *
   * The two differ in exactly the case that matters: withdrawing an override leaves the
   * columns empty and the exercise reading `written × grammar` again. A caller told only
   * that the write succeeded would have to ask a second time to learn what it undid, and
   * the authoring strip would flash empty in between.
   */
  async execute(
    command: SetExerciseSkillsCommand,
  ): Promise<Result<DerivedProfile, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }

    const applied = exercise.setSkillOverride(command.axes);
    if (applied.isFail) return Result.fail(applied.error);

    await this.exerciseRepo.save(exercise);

    await this.auditLog.record({
      entityType: 'EXERCISE',
      entityId: command.exerciseId,
      action: 'updated',
      actorUserId: command.userId,
      changedFields: ['skillsOverride', 'focusOverride'],
    });

    const derived = await this.axes.forExercise(command.exerciseId);
    // The row was just written, so this cannot miss; the guard is here because an
    // exception thrown after a successful save would report a failure that did happen.
    if (derived === null) return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);

    return Result.ok(derived);
  }
}
