import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListSchoolGroupsQuery } from './list-school-groups.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import type { SchoolGroup } from '../../../domain/entities/school-group.entity.js';

@QueryHandler(ListSchoolGroupsQuery)
export class ListSchoolGroupsHandler implements IQueryHandler<ListSchoolGroupsQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
  ) {}

  async execute(query: ListSchoolGroupsQuery): Promise<SchoolGroup[]> {
    const school = await this.schoolRepository.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);

    if (!school.getMemberRole(query.actorId) && query.actorId !== school.ownerId) {
      throw new ForbiddenOperationException('Not a member of this school');
    }

    const all = await this.groupRepository.findBySchoolId(query.schoolId);
    return all.filter((g) => !g.isDeleted);
  }
}
