import type { AgeBand } from '../../../domain/entities/school-group.entity.js';

export class SetMembershipAgeBandCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly membershipId: string,
    readonly ageBand: AgeBand,
  ) {}
}
