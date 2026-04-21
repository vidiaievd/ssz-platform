import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';

export class GetBestVariantQuery {
  constructor(
    public readonly lessonId: string,
    public readonly studentNativeLanguage: string,
    public readonly studentCurrentLevel: DifficultyLevel,
    public readonly studentKnownLanguages: string[],
  ) {}
}
