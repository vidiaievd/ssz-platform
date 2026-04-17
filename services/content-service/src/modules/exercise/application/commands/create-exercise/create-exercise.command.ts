import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class CreateExerciseCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseTemplateId: string,
    public readonly targetLanguage: string,
    public readonly difficultyLevel: DifficultyLevel,
    public readonly content: Record<string, unknown>,
    public readonly expectedAnswers: Record<string, unknown>,
    public readonly visibility: Visibility,
    public readonly answerCheckSettings?: Record<string, unknown>,
    public readonly ownerSchoolId?: string,
    public readonly estimatedDurationSeconds?: number,
  ) {}
}
