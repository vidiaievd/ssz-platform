import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class UpdateExerciseCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    public readonly difficultyLevel?: DifficultyLevel,
    public readonly content?: Record<string, unknown>,
    public readonly expectedAnswers?: Record<string, unknown>,
    public readonly answerCheckSettings?: Record<string, unknown> | null,
    public readonly visibility?: Visibility,
    public readonly estimatedDurationSeconds?: number | null,
  ) {}
}
