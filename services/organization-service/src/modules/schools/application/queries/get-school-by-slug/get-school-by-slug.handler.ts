import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetSchoolBySlugQuery } from './get-school-by-slug.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import type { SchoolDto } from '../../dto/school.dto.js';

@QueryHandler(GetSchoolBySlugQuery)
export class GetSchoolBySlugHandler implements IQueryHandler<GetSchoolBySlugQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(query: GetSchoolBySlugQuery): Promise<SchoolDto> {
    const school = await this.schoolRepository.findBySlug(query.slug);
    if (!school || school.isDeleted) throw new SchoolNotFoundException(query.slug);

    if (!school.isMember(query.actorId) && school.ownerId !== query.actorId) {
      throw new ForbiddenOperationException('You are not a member of this school');
    }

    return {
      id: school.id,
      name: school.name,
      slug: school.slug,
      description: school.description,
      ownerId: school.ownerId,
      avatarUrl: school.avatarUrl,
      website: school.website,
      contactEmail: school.contactEmail,
      city: school.city,
      type: school.type,
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
