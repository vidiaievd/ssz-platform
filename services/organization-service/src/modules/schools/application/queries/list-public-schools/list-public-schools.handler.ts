import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { ListPublicSchoolsQuery } from './list-public-schools.query.js';
import type { PublicSchoolDto } from '../get-public-school/get-public-school.handler.js';

export interface PublicSchoolPageDto {
  items: PublicSchoolDto[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
    total: number;
  };
}

@QueryHandler(ListPublicSchoolsQuery)
export class ListPublicSchoolsHandler implements IQueryHandler<ListPublicSchoolsQuery, PublicSchoolPageDto> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
  ) {}

  async execute(query: ListPublicSchoolsQuery): Promise<PublicSchoolPageDto> {
    const page = await this.schoolRepo.findPublicFiltered({
      q: query.q,
      type: query.type,
      cursor: query.cursor,
      limit: query.limit,
    });

    return {
      items: page.items.map((s) => ({
        schoolId: s.id,
        schoolSlug: s.slug,
        schoolName: s.name,
        description: s.description,
        avatarUrl: s.avatarUrl,
        city: s.city,
        website: s.website,
        isOpenForApplications: s.isActive,
      })),
      pageInfo: {
        endCursor: page.endCursor,
        hasNextPage: page.hasNextPage,
        total: page.total,
      },
    };
  }
}
