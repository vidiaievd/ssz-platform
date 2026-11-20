import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException } from '@nestjs/common';
import { ListTagsQuery } from './list-tags.query.js';
import { TagEntity } from '../../../domain/entities/tag.entity.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TAG_REPOSITORY } from '../../../domain/repositories/tag.repository.interface.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import { ORGANIZATION_CLIENT } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import type { IOrganizationClient } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import type { PaginatedResult } from '../../../../../shared/kernel/pagination.js';

@QueryHandler(ListTagsQuery)
export class ListTagsHandler implements IQueryHandler<ListTagsQuery, PaginatedResult<TagEntity>> {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepo: ITagRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
  ) {}

  async execute(query: ListTagsQuery): Promise<PaginatedResult<TagEntity>> {
    // Non-platform-admin users listing school tags must specify schoolId and be a member.
    if (query.scope === TagScope.SCHOOL && query.schoolId && !query.isPlatformAdmin) {
      const role = await this.orgClient.getMemberRole(query.userId, query.schoolId);
      if (!role) {
        throw new ForbiddenException('You must be a member of the school to list its tags');
      }
    }

    // TODO(block-6): Support listing all tags across a user's schools without specifying schoolId.
    // Requires batch membership endpoint from Organization Service.
    if (query.scope === TagScope.SCHOOL && !query.schoolId && !query.isPlatformAdmin) {
      throw new ForbiddenException(
        'Specify schoolId to list school-scoped tags (batch lookup not yet supported)',
      );
    }

    // No scope from a non-admin: global tags, plus the school's when they belong to it. Before
    // this, the list answered every school's tags to anyone (found 20.11, plan 90 §8 step 10).
    let visibleToSchool: string | null | undefined;
    if (!query.scope && !query.isPlatformAdmin) {
      if (query.schoolId) {
        const role = await this.orgClient.getMemberRole(query.userId, query.schoolId);
        if (!role) {
          throw new ForbiddenException('You must be a member of the school to list its tags');
        }
      }
      visibleToSchool = query.schoolId ?? null;
    }

    return this.tagRepo.findAll({
      scope: query.scope,
      category: query.category,
      // With `visibleToSchool` the school id widens the list instead of narrowing it.
      ownerSchoolId: visibleToSchool !== undefined ? undefined : (query.schoolId ?? undefined),
      visibleToSchool,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }
}
