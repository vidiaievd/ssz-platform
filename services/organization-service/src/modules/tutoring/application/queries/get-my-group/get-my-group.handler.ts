import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetMyGroupQuery } from './get-my-group.query.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';
import type { TutoringGroupDto } from '../../dto/tutoring-group.dto.js';

@QueryHandler(GetMyGroupQuery)
export class GetMyGroupHandler implements IQueryHandler<GetMyGroupQuery> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
  ) {}

  async execute(query: GetMyGroupQuery): Promise<TutoringGroupDto> {
    const group = await this.groupRepository.findByTutorId(query.actorId);
    if (!group || group.isDeleted) throw new TutoringGroupNotFoundException(query.actorId);

    return {
      id: group.id,
      tutorId: group.tutorId,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      isActive: group.isActive,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      students: group.students.map((s) => ({
        id: s.id,
        userId: s.userId,
        joinedAt: s.joinedAt,
      })),
    };
  }
}
