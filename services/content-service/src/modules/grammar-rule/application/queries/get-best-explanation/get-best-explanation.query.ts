import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';

export class GetBestExplanationQuery {
  constructor(
    public readonly ruleId: string,
    public readonly studentNativeLanguage: string,
    public readonly studentCurrentLevel: DifficultyLevel,
    public readonly studentKnownLanguages: string[],
  ) {}
}
