import { Inject, Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetStudentDetailQuery } from './get-student-detail.query.js';
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
import type { StudentDetailResponseDto } from '../../../presentation/dto/student-detail.response.dto.js';

@QueryHandler(GetStudentDetailQuery)
@Injectable()
export class GetStudentDetailHandler
  implements IQueryHandler<GetStudentDetailQuery, StudentDetailResponseDto>
{
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: GetStudentDetailQuery): Promise<StudentDetailResponseDto> {
    const { actorId, schoolId, studentUserId } = query;

    const school = await this.schoolRepository.findById(schoolId);
    if (!school || school.isDeleted) throw new SchoolNotFoundException(schoolId);

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

    const groupRows = await (this.prisma as any).schoolGroupMember.findMany({
      where: { userId: studentUserId, status: 'active', group: { schoolId } },
      include: { group: { include: { teachers: true } } },
      orderBy: { addedAt: 'desc' },
    });

    const visibleGroupRows =
      isUnrestricted || isSelf
        ? groupRows
        : groupRows.filter((r: any) => r.group.teachers.some((t: any) => t.userId === actorId));

    if (visibleGroupRows.length === 0 && isTeacher && !isSelf) {
      throw new ForbiddenOperationException('Not authorized to view this student');
    }

    const memberRow = await (this.prisma as any).schoolMember.findUnique({
      where: { schoolId_userId: { schoolId, userId: studentUserId } },
    });
    if (!memberRow) throw new MemberNotFoundException(studentUserId);

    const teacherIds = new Set<string>();
    for (const row of visibleGroupRows) {
      for (const t of row.group.teachers) teacherIds.add(t.userId);
    }
    const [summary, teacherSummaries] = await Promise.all([
      this.profileService.getProfileSummary(studentUserId),
      Promise.all(
        Array.from(teacherIds).map(
          async (id) => [id, await this.profileService.getProfileSummary(id)] as const,
        ),
      ).then((entries) => new Map(entries)),
    ]);

    return {
      userId: studentUserId,
      name: summary?.name ?? studentUserId,
      email: summary?.email ?? null,
      avatarUrl: summary?.avatarUrl ?? null,
      lang: visibleGroupRows[0]?.group.lang ?? null,
      level: memberRow.level ?? null,
      status: memberRow.status ?? 'active',
      progress: null,
      lastSeen: null,
      enrolledAt: (memberRow.joinedAt as Date).toISOString(),
      groups: visibleGroupRows.map((row: any) => ({
        id: row.group.id,
        name: row.group.name,
        lang: row.group.lang ?? null,
        level: row.group.level ?? null,
        teachers: row.group.teachers.map((t: any) => {
          const teacherSummary = teacherSummaries.get(t.userId);
          return {
            userId: t.userId,
            name: teacherSummary?.name ?? t.userId,
            avatarUrl: teacherSummary?.avatarUrl ?? null,
            role: t.role,
          };
        }),
      })),
    } satisfies StudentDetailResponseDto;
  }
}
