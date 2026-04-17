import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';

export class CreateExplanationCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly explanationLanguage: string,
    public readonly minLevel: DifficultyLevel,
    public readonly maxLevel: DifficultyLevel,
    public readonly displayTitle: string,
    public readonly bodyMarkdown: string,
    public readonly displaySummary?: string,
    public readonly estimatedReadingMinutes?: number,
  ) {}
}
