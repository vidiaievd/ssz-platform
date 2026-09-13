import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListSchoolTeachersQuery } from './list-school-teachers.query.js';
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
import type { SchoolTeacherDto } from '../../dto/school.dto.js';

export type { AvailabilityWindow, SchoolTeacherDto } from '../../dto/school.dto.js';

@QueryHandler(ListSchoolTeachersQuery)
export class ListSchoolTeachersHandler implements IQueryHandler<ListSchoolTeachersQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
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

    // A private tutor's workspace has no TEACHER rows: the tutor owns it and teaches it,
    // and they are deliberately absent from their own roster. Asking a screen to name the
    // teacher of a session then answered "?" — on sessions the tutor teaches themselves.
    const soloOwner = school.isSolo ? await this.ownerAsTeacher(school.ownerId) : null;

    if (rows.length === 0) return soloOwner ? [soloOwner] : [];

    // name/avatarUrl are denormalized onto SchoolMember (synced via profile.* events) —
    // no live profile-service call needed for those. Teaching languages aren't
    // denormalized yet, so that one stays a live, best-effort lookup.
    const enriched = await Promise.all(
      rows.map(async (r: any) => {
        const teachingLangs = await this.profileService.getTeachingLanguages(r.userId);

        return {
          userId: r.userId,
          name: r.name ?? r.userId,
          avatarUrl: r.avatarUrl ?? null,
          langs: teachingLangs?.langs ?? [],
          maxWeeklyHours: r.teacherAttrs?.maxWeeklyHours ?? null,
          availability: r.teacherAttrs?.availability ?? [],
          employmentType: r.teacherAttrs?.employmentType ?? null,
          status: r.teacherAttrs?.status ?? 'active',
        } satisfies SchoolTeacherDto;
      }),
    );

    return soloOwner ? [soloOwner, ...enriched] : enriched;
  }

  /**
   * The tutor as the one teacher of their workspace.
   *
   * Their name comes from profile-service rather than from a roster row, because the row
   * does not exist: ownership is what makes them staff here, and the roster is the list of
   * their learners.
   */
  private async ownerAsTeacher(ownerId: string): Promise<SchoolTeacherDto> {
    const [profile, teachingLangs] = await Promise.all([
      this.profileService.getProfileSummary(ownerId),
      this.profileService.getTeachingLanguages(ownerId),
    ]);

    return {
      userId: ownerId,
      name: profile?.name ?? ownerId,
      avatarUrl: profile?.avatarUrl ?? null,
      langs: teachingLangs?.langs ?? [],
      maxWeeklyHours: null,
      availability: [],
      employmentType: null,
      status: 'active',
    } satisfies SchoolTeacherDto;
  }
}
