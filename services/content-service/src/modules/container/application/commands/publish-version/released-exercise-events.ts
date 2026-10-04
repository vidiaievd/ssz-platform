import { itemsOf } from '@ssz/shared-kernel/exercise-items';
import { ExerciseReleasedEvent } from '../../../../exercise/domain/events/exercise-released.event.js';
import type { ReleasedExercise } from '../../ports/exercise-draft-promoter.port.js';

/**
 * One `content.exercise.released` per exercise a publish released — plan 68.
 *
 * The keys are read off the document as it now reads, by the same `itemsOf` that addresses
 * the pieces and that the engine's per-item verdicts are spelled after; a second reading
 * here could disagree with the cards it is meant to prune. A template that grades as a whole
 * gets `null`, which a consumer reads as "nothing per item to let go of".
 */
export function releasedExerciseEvents(
  released: readonly ReleasedExercise[],
): ExerciseReleasedEvent[] {
  return released.map(
    (exercise) =>
      new ExerciseReleasedEvent({
        exerciseId: exercise.exerciseId,
        templateCode: exercise.templateCode,
        itemKeys:
          itemsOf(exercise.templateCode, exercise.content, exercise.expectedAnswers)?.map(
            (item) => item.key,
          ) ?? null,
      }),
  );
}
