import type { AtomType, TargetRole } from '../../../domain/value-objects/atom-type.vo.js';

export class SetItemTargetsCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    /** Null addresses the whole exercise. */
    public readonly itemKey: string | null,
    public readonly targets: Array<{ atomType: AtomType; atomId: string; role: TargetRole }>,
  ) {}
}
