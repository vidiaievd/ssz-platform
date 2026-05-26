import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetMyTutorQuery } from './get-my-tutor.query.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';
import type { TutoringGroupSummaryDto } from '../../dto/tutoring-group.dto.js';

@QueryHandler(GetMyTutorQuery)
export class GetMyTutorHandler implements IQueryHandler<GetMyTutorQuery> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
  ) {}

  async execute(query: GetMyTutorQuery): Promise<TutoringGroupSummaryDto> {
    const group = await this.groupRepository.findByStudentId(query.actorId);
    if (!group || group.isDeleted) throw new TutoringGroupNotFoundException(query.actorId);

    return {
      id: group.id,
      tutorId: group.tutorId,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      studentCount: group.students.length,
      createdAt: group.createdAt,
    };
  }
}
