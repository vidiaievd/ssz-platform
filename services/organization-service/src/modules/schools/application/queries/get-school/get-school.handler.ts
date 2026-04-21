import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetSchoolQuery } from './get-school.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import type { SchoolDto } from '../../dto/school.dto.js';

@QueryHandler(GetSchoolQuery)
export class GetSchoolHandler implements IQueryHandler<GetSchoolQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(query: GetSchoolQuery): Promise<SchoolDto> {
    const school = await this.schoolRepository.findById(query.schoolId);
    if (!school || school.isDeleted) throw new SchoolNotFoundException(query.schoolId);

    if (!school.isMember(query.actorId) && school.ownerId !== query.actorId) {
      throw new ForbiddenOperationException('You are not a member of this school');
    }

    return {
      id: school.id,
      name: school.name,
      description: school.description,
      ownerId: school.ownerId,
      avatarUrl: school.avatarUrl,
      isActive: school.isActive,
      requireTutorReviewForSelfPaced: school.requireTutorReviewForSelfPaced,
      defaultExplanationLanguage: school.defaultExplanationLanguage,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      members: school.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  }
}
