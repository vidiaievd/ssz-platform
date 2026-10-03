import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { itemsOf } from '@ssz/shared-kernel/exercise-items';
import { SetItemTargetsCommand } from './set-item-targets.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { ExerciseItemTarget } from '../../../domain/entities/exercise-item-target.entity.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_ITEM_TARGET_REPOSITORY } from '../../../domain/repositories/exercise-item-target.repository.interface.js';
import type { IExerciseItemTargetRepository } from '../../../domain/repositories/exercise-item-target.repository.interface.js';

/**
 * "This gap is about these atoms" — the whole statement, replaced at once.
 *
 * Replace rather than add, because that is the editing gesture: an author opens one gap,
 * says what it tests, and saves. An add-one API would leave an item half-addressed whenever
 * the second call never came, and nothing would be able to tell that from a deliberate
 * single target.
 */
@CommandHandler(SetItemTargetsCommand)
export class SetItemTargetsHandler implements ICommandHandler<
  SetItemTargetsCommand,
  Result<void, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_ITEM_TARGET_REPOSITORY)
    private readonly targetRepo: IExerciseItemTargetRepository,
  ) {}

  async execute(command: SetItemTargetsCommand): Promise<Result<void, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(command.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }

    // Addressed against the document the author is looking at. An unreleased edit is what
    // the builder shows, and a gap that exists only in the draft must be addressable — the
    // alternative is telling the author their new gap is not real until they publish.
    const items = itemsOf(
      exercise.templateCode,
      exercise.authoringContent,
      exercise.authoringExpectedAnswers,
    );

    if (command.itemKey !== null) {
      if (items === null) {
        // The template grades as a whole; there is nothing inside it to point at.
        return Result.fail(ExerciseDomainError.TARGET_ITEM_NOT_IN_DOCUMENT);
      }
      const known = items.some((item) => item.key === command.itemKey);
      if (!known) {
        return Result.fail(ExerciseDomainError.TARGET_ITEM_NOT_IN_DOCUMENT);
      }
    }

    // The same atom twice on one item is a contradiction about how much the item proves,
    // not a richer statement — and the unique index would answer with a 500 rather than a
    // name if it got that far.
    const seen = new Set<string>();
    for (const target of command.targets) {
      const fingerprint = `${target.atomType}:${target.atomId}`;
      if (seen.has(fingerprint)) {
        return Result.fail(ExerciseDomainError.DUPLICATE_TARGET_ATOM);
      }
      seen.add(fingerprint);
    }

    const atoms = await this.targetRepo.describeAtoms(command.targets);
    const living = new Set(atoms.map((atom) => `${atom.atomType}:${atom.atomId}`));
    for (const target of command.targets) {
      if (!living.has(`${target.atomType}:${target.atomId}`)) {
        // Writing a target onto a retired or non-existent atom would create a broken address
        // on purpose. Broken ones exist because documents rot, not because we wrote them.
        return Result.fail(ExerciseDomainError.TARGET_ATOM_NOT_FOUND);
      }
    }

    const entities: ExerciseItemTarget[] = [];
    for (const target of command.targets) {
      const result = ExerciseItemTarget.create({
        exerciseId: command.exerciseId,
        itemKey: command.itemKey,
        atomType: target.atomType,
        atomId: target.atomId,
        role: target.role,
        createdByUserId: command.userId,
      });
      if (result.isFail) return Result.fail(result.error);
      entities.push(result.value);
    }

    await this.targetRepo.replaceForItem(command.exerciseId, command.itemKey, entities);
    return Result.ok();
  }
}
