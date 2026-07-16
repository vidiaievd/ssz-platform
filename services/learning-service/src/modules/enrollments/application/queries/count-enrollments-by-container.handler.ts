import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ENROLLMENT_REPOSITORY, type IEnrollmentRepository } from '../../domain/repositories/enrollment.repository.interface.js';
import { CountEnrollmentsByContainerQuery } from './count-enrollments-by-container.query.js';

@QueryHandler(CountEnrollmentsByContainerQuery)
export class CountEnrollmentsByContainerHandler
  implements IQueryHandler<CountEnrollmentsByContainerQuery, number>
{
  constructor(
    @Inject(ENROLLMENT_REPOSITORY) private readonly repo: IEnrollmentRepository,
  ) {}

  async execute(query: CountEnrollmentsByContainerQuery): Promise<number> {
    return this.repo.countActiveByContainerId(query.containerId);
  }
}
