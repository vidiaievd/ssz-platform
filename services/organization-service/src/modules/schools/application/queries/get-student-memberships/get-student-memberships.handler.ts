import { Inject, Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetStudentMembershipsQuery } from './get-student-memberships.query.js';
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
import type { StudentMembershipResponseDto } from '../../../presentation/dto/student-membership.response.dto.js';

@QueryHandler(GetStudentMembershipsQuery)
@Injectable()
export class GetStudentMembershipsHandler
  implements IQueryHandler<GetStudentMembershipsQuery, StudentMembershipResponseDto[]>
{
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: GetStudentMembershipsQuery): Promise<StudentMembershipResponseDto[]> {
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

    const rows = await (this.prisma as any).schoolGroupMember.findMany({
      where: { userId: studentUserId, group: { schoolId } },
      include: { group: { include: { teachers: true } } },
      orderBy: { addedAt: 'desc' },
    });

    const visibleRows =
      isUnrestricted || isSelf
        ? rows
        : rows.filter((r: any) => r.group.teachers.some((t: any) => t.userId === actorId));

    if (visibleRows.length === 0 && isTeacher && !isSelf) {
      throw new ForbiddenOperationException('Not authorized to view this student');
    }

    const teacherIds = new Set<string>();
    for (const row of visibleRows) {
      for (const t of row.group.teachers) teacherIds.add(t.userId);
    }
    const teacherSummaries = new Map(
      await Promise.all(
        Array.from(teacherIds).map(
          async (id) => [id, await this.profileService.getProfileSummary(id)] as const,
        ),
      ),
    );

    return visibleRows.map((row: any) => ({
      id: row.id,
      groupId: row.groupId,
      groupName: row.group.name,
      lang: row.group.lang ?? null,
      level: row.group.level ?? null,
      role: row.role,
      status: row.status,
      addedAt: row.addedAt,
      exitedAt: row.exitedAt ?? null,
      teachers: row.group.teachers.map((t: any) => {
        const summary = teacherSummaries.get(t.userId);
        return {
          userId: t.userId,
          name: summary?.name ?? t.userId,
          avatarUrl: summary?.avatarUrl ?? null,
          role: t.role,
        };
      }),
      schedule: [],
      groupStatus: row.group.status,
    }));
  }
}
