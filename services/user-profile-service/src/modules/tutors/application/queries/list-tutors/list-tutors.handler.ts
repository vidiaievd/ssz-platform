import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { TutorListResultDto } from '../../dto/tutor-list-item.dto.js';
import type { ITutorProfileRepository } from '../../../domain/repositories/tutor-profile.repository.interface.js';
import { TUTOR_PROFILE_REPOSITORY } from '../../../domain/repositories/tutor-profile.repository.interface.js';
import { ListTutorsQuery } from './list-tutors.query.js';

@QueryHandler(ListTutorsQuery)
export class ListTutorsHandler implements IQueryHandler<ListTutorsQuery> {
  constructor(
    @Inject(TUTOR_PROFILE_REPOSITORY)
    private readonly tutorProfileRepository: ITutorProfileRepository,
  ) {}

  async execute(query: ListTutorsQuery): Promise<TutorListResultDto> {
    return this.tutorProfileRepository.list({
      languageCode: query.languageCode,
      maxHourlyRate: query.maxHourlyRate,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
