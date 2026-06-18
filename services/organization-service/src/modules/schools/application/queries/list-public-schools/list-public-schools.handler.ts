import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { ListPublicSchoolsQuery } from './list-public-schools.query.js';
import type { PublicSchoolDto } from '../get-public-school/get-public-school.handler.js';

@QueryHandler(ListPublicSchoolsQuery)
export class ListPublicSchoolsHandler implements IQueryHandler<ListPublicSchoolsQuery, PublicSchoolDto[]> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
  ) {}

  async execute(_query: ListPublicSchoolsQuery): Promise<PublicSchoolDto[]> {
    const schools = await this.schoolRepo.findAllActive();
    return schools.map((s) => ({
      schoolId: s.id,
      schoolSlug: s.slug,
      schoolName: s.name,
      description: s.description,
      avatarUrl: s.avatarUrl,
      city: s.city,
      website: s.website,
      isOpenForApplications: s.isActive,
    }));
  }
}
