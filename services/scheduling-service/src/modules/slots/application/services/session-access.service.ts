import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Lesson } from '../../domain/entities/lesson.entity.js';

/**
 * What a person may do to a group's sessions.
 *
 * `manager` covers the school's owner and admins: they run the timetable, so
 * everything about a session is theirs to change. `teacher` records what
 * happened in their own classes and nothing else. `none` is everyone left.
 */
export type SessionRole = 'manager' | 'teacher' | 'none';

/** Fields a teacher may change on a session they themselves taught. */
const TEACHER_WRITABLE = new Set([
  'status',
  'contentUnitId',
  'contentLessonId',
  'curriculumUnitId',
  'attendance',
  'note',
]);

@Injectable()
export class SessionAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async roleIn(schoolId: string, user: AuthenticatedUser): Promise<SessionRole> {
    if (user.isPlatformAdmin) return 'manager';

    const membership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: user.userId } },
    });

    // A school's owner is not on its roster — ownership lives on the school row,
    // not in school_members — so "no membership" cannot mean "no rights" here.
    // Only the roles the roster does name are narrowed: a teacher to their own
    // classes, a student out of the timetable altogether.
    if (!membership) return 'manager';
    if (membership.role === 'TEACHER') return 'teacher';
    if (membership.role === 'STUDENT') return 'none';
    return 'manager';
  }

  /** Reading the log is open to anyone attached to the school, learners included. */
  async requireReader(schoolId: string, user: AuthenticatedUser): Promise<SessionRole> {
    const role = await this.roleIn(schoolId, user);
    if (role === 'none') {
      const membership = await this.prisma.schoolMembership.findUnique({
        where: { schoolId_userId: { schoolId, userId: user.userId } },
      });
      if (!membership) throw new ForbiddenException('Not a member of this school');
    }
    return role;
  }

  async requireManager(schoolId: string, user: AuthenticatedUser): Promise<void> {
    if ((await this.roleIn(schoolId, user)) !== 'manager') {
      throw new ForbiddenException('Only the school owner or an admin can do this');
    }
  }

  /**
   * Checks a patch against the role. A teacher may record what happened in their
   * own class — topic, attendance, whether it happened at all — but moving a
   * class, or handing it to somebody else, is the timetable's business.
   */
  async requireCanPatch(
    lesson: Lesson,
    fields: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<void> {
    const role = await this.roleIn(lesson.schoolId, user);
    if (role === 'manager') return;
    if (role === 'none') throw new ForbiddenException('Not allowed to change sessions');

    if (lesson.teacherId !== user.userId) {
      throw new ForbiddenException('A teacher can only record their own sessions');
    }
    const forbidden = Object.keys(fields).filter((f) => !TEACHER_WRITABLE.has(f));
    if (forbidden.length) {
      throw new ForbiddenException(
        `A teacher cannot change ${forbidden.join(', ')} — ask the school to reschedule`,
      );
    }
  }

  /** A teacher may add a make-up class of their own, and nothing else. */
  async requireCanCreate(
    schoolId: string,
    type: string,
    teacherId: string | null,
    user: AuthenticatedUser,
  ): Promise<void> {
    const role = await this.roleIn(schoolId, user);
    if (role === 'manager') return;
    if (role === 'none') throw new ForbiddenException('Not allowed to add sessions');

    if (type !== 'make_up') {
      throw new ForbiddenException('A teacher can only add a make-up class');
    }
    if (teacherId && teacherId !== user.userId) {
      throw new ForbiddenException('A teacher can only add a session they will teach themselves');
    }
  }

  async requireCanGrade(lesson: Lesson, user: AuthenticatedUser): Promise<void> {
    const role = await this.roleIn(lesson.schoolId, user);
    if (role === 'manager') return;
    if (role === 'teacher' && lesson.teacherId === user.userId) return;
    throw new ForbiddenException('Only the school or the session’s own teacher can grade it');
  }
}
