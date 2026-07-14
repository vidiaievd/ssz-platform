import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';

export class GetLessonReaderContentQuery {
  constructor(
    public readonly lessonId: string,
    public readonly studentNativeLanguage: string,
    public readonly studentCurrentLevel: DifficultyLevel,
    public readonly studentKnownLanguages: string[],
  ) {}
}
