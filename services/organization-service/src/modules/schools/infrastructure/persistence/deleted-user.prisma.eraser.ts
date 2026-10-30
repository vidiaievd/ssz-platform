import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  DeletedUserFootprint,
  ErasedOrganizationData,
  IDeletedUserEraser,
} from '../../application/ports/deleted-user-eraser.interface.js';

@Injectable()
export class DeletedUserPrismaEraser implements IDeletedUserEraser {
  constructor(private readonly prisma: PrismaService) {}

  async footprint(userId: string): Promise<DeletedUserFootprint> {
    const [members, seats, tutoring] = await Promise.all([
      this.prisma.schoolMember.findMany({
        where: { userId, role: 'STUDENT', status: 'active' },
        select: { schoolId: true },
      }),
      this.prisma.schoolGroupMember.findMany({
        where: { userId, status: 'active' },
        select: { groupId: true, group: { select: { schoolId: true, courseId: true } } },
      }),
      this.prisma.tutoringStudent.findMany({
        where: { userId },
        select: { tutorGroupId: true },
      }),
    ]);
    return {
      activeStudentSchoolIds: members.map((m) => m.schoolId),
      activeGroupSeats: seats.map((s) => ({
        schoolId: s.group.schoolId,
        groupId: s.groupId,
        courseId: s.group.courseId ?? null,
      })),
      tutoringGroupIds: tutoring.map((t) => t.tutorGroupId),
    };
  }

  async erase(userId: string, email: string | null): Promise<ErasedOrganizationData> {
    const byEmail = email ? { email: { equals: email, mode: 'insensitive' as const } } : null;
    // A student's seat in a group is a school_group_members row whatever its role says; only
    // the school roster distinguishes a student from staff.
    const [
      groupSeats,
      schoolMembers,
      memberships,
      levelHistory,
      nudges,
      tutoringSeats,
      schoolInvitations,
      tutoringInvitations,
      assistantLists,
    ] = await this.prisma.$transaction([
      this.prisma.schoolGroupMember.deleteMany({ where: { userId } }),
      this.prisma.schoolMember.deleteMany({ where: { userId, role: 'STUDENT' } }),
      this.prisma.schoolMembership.deleteMany({ where: { studentId: userId } }),
      this.prisma.studentLevelHistory.deleteMany({ where: { studentId: userId } }),
      this.prisma.studentNudge.deleteMany({ where: { studentId: userId } }),
      this.prisma.tutoringStudent.deleteMany({ where: { userId } }),
      this.prisma.schoolInvitation.deleteMany({ where: byEmail ?? { id: { in: [] } } }),
      this.prisma.tutoringInvitation.deleteMany({ where: byEmail ?? { id: { in: [] } } }),
      this.prisma.$executeRaw`
        UPDATE schools
           SET assistant_student_ids = array_remove(assistant_student_ids, ${userId})
         WHERE ${userId} = ANY(assistant_student_ids)`,
    ]);
    return {
      schoolMembers: schoolMembers.count,
      groupSeats: groupSeats.count,
      memberships: memberships.count,
      levelHistory: levelHistory.count,
      nudges: nudges.count,
      tutoringSeats: tutoringSeats.count,
      invitations: schoolInvitations.count + tutoringInvitations.count,
      assistantLists,
    };
  }
}
