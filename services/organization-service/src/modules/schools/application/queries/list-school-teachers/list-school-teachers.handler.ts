import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListSchoolTeachersQuery } from './list-school-teachers.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

export interface AvailabilityWindow {
  weekday: number; // 1=Mon .. 7=Sun
  start: string;   // "HH:mm"
  end: string;
}

export interface SchoolTeacherDto {
  userId: string;
  maxWeeklyHours: number | null;
  availability: AvailabilityWindow[];
}

@QueryHandler(ListSchoolTeachersQuery)
export class ListSchoolTeachersHandler implements IQueryHandler<ListSchoolTeachersQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(query: ListSchoolTeachersQuery): Promise<SchoolTeacherDto[]> {
    const school = await this.schoolRepository.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);

    const actorRole = school.getMemberRole(query.actorId);
    const isOwner = query.actorId === school.ownerId;
    if (!isOwner && !actorRole) {
      throw new ForbiddenOperationException('Not a member of this school');
    }

    // Fetch all TEACHER members + their attrs in one join
    const rows = await (this.prisma as any).schoolMember.findMany({
      where: { schoolId: query.schoolId, role: MemberRole.TEACHER },
      include: { teacherAttrs: true },
      orderBy: { joinedAt: 'asc' },
    });

    return rows.map((r: any) => ({
      userId: r.userId,
      maxWeeklyHours: r.teacherAttrs?.maxWeeklyHours ?? null,
      availability: (r.teacherAttrs?.availability as AvailabilityWindow[]) ?? [],
    }));
  }
}
