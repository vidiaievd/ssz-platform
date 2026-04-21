import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';

export class UpdateContainerCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly title?: string,
    public readonly description?: string | null,
    public readonly difficultyLevel?: DifficultyLevel,
    public readonly coverImageMediaId?: string | null,
    public readonly visibility?: Visibility,
    public readonly accessTier?: AccessTier,
  ) {}
}
