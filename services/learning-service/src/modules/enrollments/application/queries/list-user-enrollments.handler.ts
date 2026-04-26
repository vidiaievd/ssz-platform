import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ENROLLMENT_REPOSITORY, type IEnrollmentRepository } from '../../domain/repositories/enrollment.repository.interface.js';
import { toEnrollmentDto, type EnrollmentDto } from '../dto/enrollment.dto.js';
import { ListUserEnrollmentsQuery } from './list-user-enrollments.query.js';

@QueryHandler(ListUserEnrollmentsQuery)
export class ListUserEnrollmentsHandler
  implements IQueryHandler<ListUserEnrollmentsQuery, EnrollmentDto[]>
{
  constructor(
    @Inject(ENROLLMENT_REPOSITORY) private readonly repo: IEnrollmentRepository,
  ) {}

  async execute(query: ListUserEnrollmentsQuery): Promise<EnrollmentDto[]> {
    const enrollments = await this.repo.findByUser(query.userId, { status: query.status });
    return enrollments.map(toEnrollmentDto);
  }
}
