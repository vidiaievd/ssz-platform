import type { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';

export class CreateAtomCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly key: string,
    public readonly title: string,
    public readonly track: AtomTrack,
    public readonly description?: string | null,
  ) {}
}
