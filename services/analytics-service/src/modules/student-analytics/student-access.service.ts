import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

/**
 * Who may read a named learner's numbers.
 *
 * Two callers, one rule. The learner's own screen (§3.6) asks about themselves, and a
 * teacher's screen C asks about somebody in a school they both belong to. Anyone else is
 * answered "not found" rather than "forbidden": whether a given person is a student of a
 * given school is itself the kind of thing this endpoint should not confirm.
 *
 * As on the group routes, this is membership of a shared school and no finer — which
 * teacher may open which learner is checked where the rosters are already loaded
 * (plan 58 §2 F), and the endpoint is knowingly softer than the screen (§4).
 */
@Injectable()
export class StudentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertMayRead(studentId: string, viewerUserId: string): Promise<void> {
    if (studentId === viewerUserId) return;

    const schools = await this.prisma.schoolMembership.findMany({
      where: { userId: viewerUserId },
      select: { schoolId: true },
    });
    if (schools.length === 0) throw new NotFoundException('Student not found');

    const shared = await this.prisma.schoolMembership.findFirst({
      where: { userId: studentId, schoolId: { in: schools.map((row) => row.schoolId) } },
      select: { userId: true },
    });
    if (!shared) throw new NotFoundException('Student not found');
  }
}
