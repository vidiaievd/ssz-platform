import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListSchoolMembersQuery } from './list-school-members.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../../shared/application/ports/profile-service.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

export interface MemberRosterItemDto {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: MemberRole;
  langs: string[];
  maxWeeklyHours: number | null;
  status: string;
  joinedAt: string;
}

@QueryHandler(ListSchoolMembersQuery)
export class ListSchoolMembersHandler implements IQueryHandler<ListSchoolMembersQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: ListSchoolMembersQuery): Promise<MemberRosterItemDto[]> {
    const school = await this.schoolRepository.findById(query.schoolId);
    if (!school || school.isDeleted) throw new SchoolNotFoundException(query.schoolId);

    const isOwner = query.actorId === school.ownerId;
    const actorRole = school.getMemberRole(query.actorId);
    if (!isOwner && !actorRole) {
      throw new ForbiddenOperationException('Not a member of this school');
    }

    const where: Record<string, unknown> = { schoolId: query.schoolId };
    if (query.role) where['role'] = query.role;

    const rows = await (this.prisma as any).schoolMember.findMany({
      where,
      include: { teacherAttrs: true },
      orderBy: { joinedAt: 'asc' },
    });

    if (rows.length === 0) return [];

    return Promise.all(
      rows.map(async (r: any) => {
        const isTeacher = r.role === MemberRole.TEACHER;

        const [summary, teachingLangs] = await Promise.all([
          this.profileService.getProfileSummary(r.userId),
          isTeacher ? this.profileService.getTeachingLanguages(r.userId) : Promise.resolve(null),
        ]);

        return {
          userId: r.userId,
          name: summary?.name ?? r.userId,
          email: summary?.email ?? null,
          avatarUrl: summary?.avatarUrl ?? null,
          role: r.role as MemberRole,
          langs: teachingLangs?.langs ?? [],
          maxWeeklyHours: isTeacher ? (r.teacherAttrs?.maxWeeklyHours ?? null) : null,
          status: isTeacher ? (r.teacherAttrs?.status ?? 'active') : 'active',
          joinedAt: (r.joinedAt as Date).toISOString(),
        } satisfies MemberRosterItemDto;
      }),
    );
  }
}
