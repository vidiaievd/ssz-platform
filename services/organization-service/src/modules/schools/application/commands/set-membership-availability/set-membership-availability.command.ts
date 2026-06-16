import type { AvailabilitySlot } from '../../../domain/entities/school-membership.entity.js';

export class SetMembershipAvailabilityCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly membershipId: string,
    readonly prefs: AvailabilitySlot[],
  ) {}
}
