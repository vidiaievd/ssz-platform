import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { CheckNameAvailableQuery } from './check-name-available.query.js';

@QueryHandler(CheckNameAvailableQuery)
export class CheckNameAvailableHandler implements IQueryHandler<CheckNameAvailableQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(query: CheckNameAvailableQuery): Promise<{ available: boolean }> {
    const existing = await this.schoolRepository.findByName(query.name);
    return { available: existing === null };
  }
}
