import type { ExerciseScope } from '../../../domain/prosody-owner.js';

export class GetExerciseProsodyQuery {
  constructor(
    public readonly exerciseId: string,
    public readonly scope: ExerciseScope,
  ) {}
}
