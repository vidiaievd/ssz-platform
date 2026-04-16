import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

export class CreateVocabularyListCommand {
  constructor(
    public readonly userId: string,
    public readonly targetLanguage: string,
    public readonly difficultyLevel: DifficultyLevel,
    public readonly title: string,
    public readonly visibility: Visibility,
    public readonly description?: string,
    public readonly coverImageMediaId?: string,
    public readonly ownerSchoolId?: string,
    public readonly autoAddToSrs?: boolean,
  ) {}
}
