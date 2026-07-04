import type { CanDoScope } from '../../../domain/value-objects/can-do-scope.vo.js';
import type { CanDoSkill } from '../../../domain/value-objects/can-do-skill.vo.js';
import type { CefrLevel } from '../../../domain/entities/can-do-descriptor.entity.js';

export class ListCanDoDescriptorsQuery {
  constructor(
    public readonly scope?: CanDoScope,
    public readonly ownerSchoolId?: string | null,
    public readonly cefrLevel?: CefrLevel,
    public readonly skill?: CanDoSkill,
  ) {}
}
