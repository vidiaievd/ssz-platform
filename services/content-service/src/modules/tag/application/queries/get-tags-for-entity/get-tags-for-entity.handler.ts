import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetTagsForEntityQuery } from './get-tags-for-entity.query.js';
import { TagEntity } from '../../../domain/entities/tag.entity.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TAG_REPOSITORY } from '../../../domain/repositories/tag.repository.interface.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import { TAG_ASSIGNMENT_REPOSITORY } from '../../../domain/repositories/tag-assignment.repository.interface.js';
import type { ITagAssignmentRepository } from '../../../domain/repositories/tag-assignment.repository.interface.js';
import { ORGANIZATION_CLIENT } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import type { IOrganizationClient } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';

@QueryHandler(GetTagsForEntityQuery)
export class GetTagsForEntityHandler implements IQueryHandler<GetTagsForEntityQuery, TagEntity[]> {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepo: ITagRepository,
    @Inject(TAG_ASSIGNMENT_REPOSITORY) private readonly assignmentRepo: ITagAssignmentRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
  ) {}

  async execute(query: GetTagsForEntityQuery): Promise<TagEntity[]> {
    const assignments = await this.assignmentRepo.findByEntity(query.entityType, query.entityId);
    if (assignments.length === 0) return [];

    const tagIds = assignments.map((a) => a.tagId);
    const tags: TagEntity[] = [];

    for (const id of tagIds) {
      const tag = await this.tagRepo.findById(id);
      if (!tag || tag.deletedAt !== null) continue;

      // Filter school-scoped tags for non-members.
      if (tag.scope === TagScope.SCHOOL && tag.ownerSchoolId && !query.isPlatformAdmin) {
        const role = await this.orgClient.getMemberRole(query.userId, tag.ownerSchoolId);
        if (!role) continue;
      }

      tags.push(tag);
    }

    return tags;
  }
}
