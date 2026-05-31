import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { GetSchoolGroupQuery } from './get-school-group.query.js';
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

@QueryHandler(GetSchoolGroupQuery)
export class GetSchoolGroupHandler implements IQueryHandler<GetSchoolGroupQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
  ) {}

  async execute(query: GetSchoolGroupQuery): Promise<SchoolGroup> {
    const school = await this.schoolRepository.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);

    if (!school.getMemberRole(query.actorId) && query.actorId !== school.ownerId) {
      throw new ForbiddenOperationException('Not a member of this school');
    }

    const group = await this.groupRepository.findById(query.groupId);
    if (!group || group.isDeleted || group.schoolId !== query.schoolId) {
      throw new NotFoundException(`Group ${query.groupId} not found`);
    }

    return group;
  }
}
