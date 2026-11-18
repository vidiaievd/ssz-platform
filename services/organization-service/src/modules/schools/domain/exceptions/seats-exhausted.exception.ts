import type { SeatUsage } from '../value-objects/seat-policy.vo.js';

/** The school's roster is at its seat ceiling; no new learner fits (plan 90, phase 4). → 409 `SEATS_EXHAUSTED`. */
export class SeatsExhaustedException extends Error {
  constructor(
    public readonly schoolId: string,
    public readonly seats: SeatUsage,
  ) {
    super(`School ${schoolId} has no student seats left (${seats.used} / ${seats.limit ?? '∞'})`);
    this.name = 'SeatsExhaustedException';
  }
}
