import type { CanDoSkill } from '../../../domain/value-objects/can-do-skill.vo.js';
import type { CanDoScope } from '../../../domain/value-objects/can-do-scope.vo.js';
import type { CefrLevel, CanDoLocalization } from '../../../domain/entities/can-do-descriptor.entity.js';

export class CreateCanDoDescriptorCommand {
  constructor(
    public readonly userId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly cefrLevel: CefrLevel,
    public readonly skill: CanDoSkill,
    public readonly scope: CanDoScope,
    public readonly localizations: CanDoLocalization[],
    public readonly ownerSchoolId?: string,
    public readonly source?: string,
  ) {}
}
