import type { PlacementScope } from '../../../domain/entities/placement-result.entity.js';

export class RecordPlacementCommand {
  constructor(
    readonly userId: string,
    readonly language: string,
    readonly cefrLevel: string,
    readonly score: number,
    readonly scope: PlacementScope,
    readonly membershipId: string | undefined,
    readonly sourceLabel: string,
    readonly takenAt: Date,
  ) {}
}
