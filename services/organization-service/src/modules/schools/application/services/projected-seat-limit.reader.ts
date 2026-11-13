import { Logger } from '@nestjs/common';
import type {
  ISeatLimitProjection,
  ISeatLimitReader,
  ISeatLimitSource,
  SeatLimitReading,
  SeatLimitSnapshot,
} from '../../../../shared/application/ports/seat-limit.interface.js';

/**
 * Plan 90, phase 4: a school's student seat limit, read from the local projection of
 * `subscription.entitlements.changed`.
 *
 * No row (the event has not arrived, or the school predates the projection) or a row past
 * its `validUntil` (a grant ran out, a subscription ended — the fresh event follows within a
 * minute) → subscription-service's internal API is asked and its answer stored. That read
 * failing does NOT refuse: a stale row is still used if there is one, otherwise the limit is
 * `known: false` and the learner is let in — an outage must not lock learners out of a school,
 * and an excess shows up in the platform admin's attention queue (decided 10.11).
 *
 * Built by a factory in `schools.module.ts` (the clock is not injectable).
 */
export class ProjectedSeatLimitReader implements ISeatLimitReader {
  private readonly logger = new Logger(ProjectedSeatLimitReader.name);

  constructor(
    private readonly projection: ISeatLimitProjection,
    private readonly source: ISeatLimitSource,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async studentSeatLimit(schoolId: string): Promise<SeatLimitReading> {
    let held: SeatLimitSnapshot | null = null;
    try {
      held = await this.projection.get(schoolId);
    } catch (err) {
      this.logger.warn(`Seat limit projection of ${schoolId} unreadable: ${describe(err)}`);
    }
    if (held && held.validUntil > this.clock()) return { known: true, max: held.max };

    try {
      const fetched = await this.source.fetchStudentSeatLimit(schoolId);
      try {
        // A fresher event may have landed meanwhile; the projection keeps whichever wins.
        const stored = await this.projection.save(schoolId, fetched);
        if (!stored) {
          const now = await this.projection.get(schoolId);
          if (now) return { known: true, max: now.max };
        }
      } catch (err) {
        this.logger.warn(`Seat limit of ${schoolId} read through but not stored: ${describe(err)}`);
      }
      return { known: true, max: fetched.max };
    } catch (err) {
      if (held) {
        this.logger.warn(`Seat limit of ${schoolId}: subscription-service unavailable, using a stale snapshot (v${held.version})`);
        return { known: true, max: held.max };
      }
      this.logger.error(`Seat limit of ${schoolId} unknown — the learner is let in unchecked: ${describe(err)}`);
      return { known: false };
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
