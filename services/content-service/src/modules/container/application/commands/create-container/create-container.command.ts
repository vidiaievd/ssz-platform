import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';

export class CreateContainerCommand {
  constructor(
    public readonly userId: string,
    public readonly containerType: ContainerType,
    public readonly targetLanguage: string,
    public readonly difficultyLevel: DifficultyLevel,
    public readonly title: string,
    public readonly visibility: Visibility,
    public readonly description?: string,
    public readonly coverImageMediaId?: string,
    public readonly ownerSchoolId?: string,
    public readonly accessTier?: AccessTier,
  ) {}
}
