import { ExerciseFilter } from '../../../domain/repositories/exercise.repository.interface.js';

export class GetExercisesQuery {
  constructor(public readonly filter: ExerciseFilter) {}
}
