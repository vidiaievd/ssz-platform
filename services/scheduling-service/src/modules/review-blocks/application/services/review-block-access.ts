import {
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { SCHOOL_ROLE_READER, type ISchoolRoleReader } from '../ports/school-role.reader.js';

/** Who marks work, and so may hold time for it. */
export const REVIEWER_ROLES: ReadonlySet<string> = new Set(['OWNER', 'ADMIN', 'MANAGER', 'TEACHER']);

/** Who runs the school's timetable, and so may hold that time for somebody else. */
export const TIMETABLE_ROLES: ReadonlySet<string> = new Set(['OWNER', 'ADMIN', 'MANAGER', 'SCHEDULER']);

export type BlockAccess = 'ok' | 'TARGET_NOT_REVIEWER' | 'NOT_ALLOWED';

/**
 * Whether a caller may write a teacher's review blocks in a school (plan 81, Q2).
 *
 * The teacher keeps their own; the school's timetable keeps anybody's. Either way the
 * block must belong to somebody who marks work there — time for marking held for a
 * learner or an outsider means nothing.
 */
export function decideBlockAccess(input: {
  callerRole: string | null;
  targetRole: string | null;
  self: boolean;
  platformAdmin: boolean;
}): BlockAccess {
  if (input.targetRole === null || !REVIEWER_ROLES.has(input.targetRole)) return 'TARGET_NOT_REVIEWER';
  if (input.platformAdmin) return 'ok';
  if (input.self) return 'ok';
  if (input.callerRole !== null && TIMETABLE_ROLES.has(input.callerRole)) return 'ok';
  return 'NOT_ALLOWED';
}

/**
 * Rights over review blocks, asked live of organization-service rather than the
 * membership projection: the projection reads "not on the roster" as the owner, which
 * would hand an outsider the school's timetable.
 */
@Injectable()
export class ReviewBlockAccessService {
  constructor(@Inject(SCHOOL_ROLE_READER) private readonly roles: ISchoolRoleReader) {}

  async requireCanWrite(schoolId: string, teacherId: string, user: AuthenticatedUser): Promise<void> {
    const self = teacherId === user.userId;
    const [targetRole, callerRole] = await Promise.all([
      this.roles.getMemberRole(schoolId, teacherId),
      self || user.isPlatformAdmin ? Promise.resolve(null) : this.roles.getMemberRole(schoolId, user.userId),
    ]);

    const access = decideBlockAccess({
      callerRole: self ? targetRole : callerRole,
      targetRole,
      self,
      platformAdmin: user.isPlatformAdmin,
    });
    if (access === 'TARGET_NOT_REVIEWER') {
      throw new UnprocessableEntityException({
        code: 'TARGET_NOT_REVIEWER',
        message: 'Time for marking can only be held for somebody who marks work in this school',
      });
    }
    if (access === 'NOT_ALLOWED') {
      throw new ForbiddenException('Only the teacher or the school’s timetable can change these blocks');
    }
  }

  /** The school-wide read is the timetable's view, not a teacher's. */
  async requireCanReadSchool(schoolId: string, user: AuthenticatedUser): Promise<void> {
    if (user.isPlatformAdmin) return;
    const role = await this.roles.getMemberRole(schoolId, user.userId);
    if (role === null || !TIMETABLE_ROLES.has(role)) {
      throw new ForbiddenException('Only the school’s timetable can read every teacher’s blocks');
    }
  }
}
