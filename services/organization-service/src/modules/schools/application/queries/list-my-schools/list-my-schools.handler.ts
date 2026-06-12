import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListMySchoolsQuery } from './list-my-schools.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import type { SchoolSummaryDto } from '../../dto/school.dto.js';

const ROLES_WITH_NULL_CAPS: ReadonlySet<MemberRole> = new Set([
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.CONTENT_ADMIN,
  MemberRole.SCHEDULER,
]);

@QueryHandler(ListMySchoolsQuery)
export class ListMySchoolsHandler implements IQueryHandler<ListMySchoolsQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(query: ListMySchoolsQuery): Promise<SchoolSummaryDto[]> {
    const actorId = query.actorId;

    // Schools where user is owner OR an explicit member
    const [owned, memberOf] = await Promise.all([
      this.schoolRepository.findByOwnerId(actorId),
      this.schoolRepository.findMemberSchools(actorId),
    ]);

    // Merge and deduplicate by id
    const seen = new Set<string>();
    const all = [...owned, ...memberOf].filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    // Determine effective role for each school
    const roleMap = new Map<string, MemberRole>();
    for (const school of all) {
      if (school.ownerId === actorId) {
        roleMap.set(school.id, MemberRole.OWNER);
      } else {
        const role = school.getMemberRole(actorId);
        if (role) roleMap.set(school.id, role);
      }
    }

    // Batch-fetch capabilities for MANAGER schools (avoids N+1)
    const managerSchoolIds = [...roleMap.entries()]
      .filter(([, role]) => role === MemberRole.MANAGER)
      .map(([id]) => id);

    const capsMap = await this.schoolRepository.findManagerCapabilities(actorId, managerSchoolIds);

    return all.map((s) => {
      const myRole = roleMap.get(s.id) ?? MemberRole.TEACHER;

      let myCapabilities: string[] | null;
      if (myRole === MemberRole.MANAGER) {
        myCapabilities = capsMap.get(s.id) ?? [];
      } else if (ROLES_WITH_NULL_CAPS.has(myRole)) {
        myCapabilities = null;
      } else {
        myCapabilities = [];
      }

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        ownerId: s.ownerId,
        avatarUrl: s.avatarUrl,
        website: s.website,
        contactEmail: s.contactEmail,
        city: s.city,
        memberCount: s.members.length,
        createdAt: s.createdAt,
        myRole,
        myCapabilities,
      };
    });
  }
}
