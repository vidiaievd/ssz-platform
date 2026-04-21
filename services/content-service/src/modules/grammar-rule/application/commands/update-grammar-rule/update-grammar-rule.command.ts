import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';

export class UpdateGrammarRuleCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly title?: string,
    public readonly description?: string | null,
    public readonly difficultyLevel?: DifficultyLevel,
    public readonly topic?: GrammarTopic,
    public readonly subtopic?: string | null,
    public readonly visibility?: Visibility,
  ) {}
}
