import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class UpdateLessonCommand {
  constructor(
    public readonly userId: string,
    public readonly lessonId: string,
    public readonly title?: string,
    public readonly description?: string | null,
    public readonly difficultyLevel?: DifficultyLevel,
    public readonly coverImageMediaId?: string | null,
    public readonly visibility?: Visibility,
  ) {}
}
