import { Inject, Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetStudentHistoryQuery } from './get-student-history.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { MemberNotFoundException } from '../../../domain/exceptions/member-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../../shared/application/ports/profile-service.interface.js';
import type { StudentLevelHistoryEntryResponseDto } from '../../../presentation/dto/student-level-history.response.dto.js';

@QueryHandler(GetStudentHistoryQuery)
@Injectable()
export class GetStudentHistoryHandler
  implements IQueryHandler<GetStudentHistoryQuery, StudentLevelHistoryEntryResponseDto[]>
{
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: GetStudentHistoryQuery): Promise<StudentLevelHistoryEntryResponseDto[]> {
    const { actorId, schoolId, studentUserId } = query;

    const school = await this.schoolRepository.findById(schoolId);
    if (!school) throw new SchoolNotFoundException(schoolId);

    const targetRole = school.getMemberRole(studentUserId);
    if (targetRole !== MemberRole.STUDENT) {
      throw new MemberNotFoundException(studentUserId);
    }

    const isOwner = actorId === school.ownerId;
    const actorRole = school.getMemberRole(actorId);
    const isSelf = actorId === studentUserId;
    const isUnrestricted =
      isOwner || actorRole === MemberRole.ADMIN || actorRole === MemberRole.SCHEDULER;
    const isTeacher = actorRole === MemberRole.TEACHER;

    if (!isSelf && !isUnrestricted && !isTeacher) {
      throw new ForbiddenOperationException('Not authorized to view this student');
    }

    if (isTeacher && !isSelf) {
      const overlap = await (this.prisma as any).schoolGroupMember.findFirst({
        where: {
          userId: studentUserId,
          group: { schoolId, teachers: { some: { userId: actorId } } },
        },
      });
      if (!overlap) throw new ForbiddenOperationException('Not authorized to view this student');
    }

    const rows = await (this.prisma as any).studentLevelHistory.findMany({
      where: { schoolId, studentId: studentUserId },
      orderBy: { startedAt: 'asc' },
    });

    const groupIds = Array.from(new Set(rows.map((r: any) => r.groupId).filter(Boolean)));
    const groups = groupIds.length
      ? await (this.prisma as any).schoolGroup.findMany({
          where: { id: { in: groupIds } },
          include: { teachers: true },
        })
      : [];
    const groupById = new Map(groups.map((g: any) => [g.id, g]));

    const assessorIds = Array.from(new Set(rows.map((r: any) => r.assessedBy).filter(Boolean)));
    const assessorSummaries = new Map(
      await Promise.all(
        assessorIds.map(
          async (id: any) => [id, await this.profileService.getProfileSummary(id)] as const,
        ),
      ),
    );

    return rows.map((row: any) => {
      const group: any = row.groupId ? groupById.get(row.groupId) : null;
      const summary = row.assessedBy ? assessorSummaries.get(row.assessedBy) : null;
      const assessorTeacherRole = group?.teachers.find((t: any) => t.userId === row.assessedBy)?.role ?? null;

      return {
        level: row.level,
        startedAt: row.startedAt,
        endedAt: row.endedAt ?? null,
        groupId: row.groupId ?? null,
        groupName: group?.name ?? null,
        assessedBy: row.assessedBy
          ? {
              userId: row.assessedBy,
              name: summary?.name ?? row.assessedBy,
              avatarUrl: summary?.avatarUrl ?? null,
              role: assessorTeacherRole,
            }
          : null,
      };
    });
  }
}
