import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  SEAT_LIMIT_READER,
  type ISeatLimitReader,
} from '../../../../../shared/application/ports/seat-limit.interface.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  STUDENT_SEAT_REPOSITORY,
  type IStudentSeatRepository,
} from '../../../domain/repositories/student-seat.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { seatUsage, type SeatUsage } from '../../../domain/value-objects/seat-policy.vo.js';
import { GetSchoolSeatsQuery } from './get-school-seats.query.js';

const SEAT_READERS: readonly string[] = [MemberRole.ADMIN, MemberRole.MANAGER];

/**
 * Where the school's roster stands against its student seats. Owner, administrators and
 * managers read it (the people who add learners). An unreadable limit is shown as "no limit"
 * — the same way the roster checks treat it (they let the learner in), so the screen never
 * shows a warning that the checks would not act on.
 */
@QueryHandler(GetSchoolSeatsQuery)
export class GetSchoolSeatsHandler implements IQueryHandler<GetSchoolSeatsQuery, SeatUsage> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
    @Inject(SEAT_LIMIT_READER) private readonly limits: ISeatLimitReader,
    @Inject(STUDENT_SEAT_REPOSITORY) private readonly seats: IStudentSeatRepository,
  ) {}

  async execute({ schoolId, actorId }: GetSchoolSeatsQuery): Promise<SeatUsage> {
    const school = await this.schools.findById(schoolId);
    if (!school || school.isDeleted) throw new SchoolNotFoundException(schoolId);

    const role = school.getMemberRole(actorId);
    if (actorId !== school.ownerId && !(role && SEAT_READERS.includes(role))) {
      throw new ForbiddenOperationException('Only owner, admin or manager can read the school seats');
    }

    const [reading, used] = await Promise.all([
      this.limits.studentSeatLimit(schoolId),
      this.seats.countActiveStudents(schoolId),
    ]);
    return seatUsage(used, reading.known ? reading.max : null);
  }
}
