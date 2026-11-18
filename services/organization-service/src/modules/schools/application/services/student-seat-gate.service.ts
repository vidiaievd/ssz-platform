import { Inject, Injectable } from '@nestjs/common';
import {
  SEAT_LIMIT_READER,
  type ISeatLimitReader,
} from '../../../../shared/application/ports/seat-limit.interface.js';
import {
  STUDENT_SEAT_REPOSITORY,
  type IStudentSeatRepository,
  type SeatClaim,
} from '../../domain/repositories/student-seat.repository.interface.js';
import { admitOneStudent, type SeatUsage } from '../../domain/value-objects/seat-policy.vo.js';
import { SeatsExhaustedException } from '../../domain/exceptions/seats-exhausted.exception.js';

/**
 * The one door a learner passes to take a seat on a school's roster (plan 90, phase 4).
 *
 * The limit is read first (projection, or subscription-service on a miss — never under the
 * lock); an unknown limit lets the learner in (decided 10.11), and so does a school without
 * one. The answer is the usage after the learner joined, or null when the limit is unknown —
 * the school then gets no seat warning rather than a made-up one.
 */
@Injectable()
export class StudentSeatGate {
  constructor(
    @Inject(SEAT_LIMIT_READER) private readonly limits: ISeatLimitReader,
    @Inject(STUDENT_SEAT_REPOSITORY) private readonly seats: IStudentSeatRepository,
  ) {}

  /** Takes a seat and writes the roster row, or throws `SeatsExhaustedException`. */
  async claim(schoolId: string, claim: SeatClaim): Promise<SeatUsage | null> {
    const reading = await this.limits.studentSeatLimit(schoolId);
    const limit = reading.known ? reading.max : null;
    const decision = await this.seats.claim(schoolId, claim, (used) => admitOneStudent(used, limit));
    if (!decision.admitted) throw new SeatsExhaustedException(schoolId, decision.seats);
    return reading.known ? decision.seats : null;
  }

  /**
   * Refuses up front when the roster is already at its ceiling — an invitation the learner
   * could never accept is not sent. No lock: the seat itself is taken on acceptance.
   */
  async assertRoomForOneMore(schoolId: string): Promise<void> {
    const reading = await this.limits.studentSeatLimit(schoolId);
    if (!reading.known || reading.max === null) return;
    const decision = admitOneStudent(await this.seats.countActiveStudents(schoolId), reading.max);
    if (!decision.admitted) throw new SeatsExhaustedException(schoolId, decision.seats);
  }
}
