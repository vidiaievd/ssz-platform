import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';

export class CreateGrammarRuleCommand {
  constructor(
    public readonly userId: string,
    public readonly targetLanguage: string,
    public readonly difficultyLevel: DifficultyLevel,
    public readonly topic: GrammarTopic,
    public readonly title: string,
    public readonly visibility: Visibility,
    public readonly subtopic?: string,
    public readonly description?: string,
    public readonly ownerSchoolId?: string,
  ) {}
}
