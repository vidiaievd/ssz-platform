import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListMySchoolsQuery } from './list-my-schools.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import type { SchoolSummaryDto } from '../../dto/school.dto.js';

@QueryHandler(ListMySchoolsQuery)
export class ListMySchoolsHandler implements IQueryHandler<ListMySchoolsQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(query: ListMySchoolsQuery): Promise<SchoolSummaryDto[]> {
    // Schools where user is owner OR an explicit member
    const [owned, memberOf] = await Promise.all([
      this.schoolRepository.findByOwnerId(query.actorId),
      this.schoolRepository.findMemberSchools(query.actorId),
    ]);

    // Merge and deduplicate by id
    const seen = new Set<string>();
    const all = [...owned, ...memberOf].filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    return all.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      ownerId: s.ownerId,
      avatarUrl: s.avatarUrl,
      memberCount: s.members.length,
      createdAt: s.createdAt,
    }));
  }
}
