import type { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';

export class UpdateAtomCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly atomId: string,
    public readonly key?: string,
    public readonly title?: string,
    public readonly description?: string | null,
    public readonly track?: AtomTrack,
  ) {}
}
