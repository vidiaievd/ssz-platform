import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ENROLLMENT_REPOSITORY, type IEnrollmentRepository } from '../../domain/repositories/enrollment.repository.interface.js';
import { Result } from '../../../../shared/kernel/result.js';
import { toEnrollmentDto, type EnrollmentDto } from '../dto/enrollment.dto.js';
import {
  EnrollmentNotFoundError,
  EnrollmentForbiddenError,
  type EnrollmentApplicationError,
} from '../errors/enrollment-application.errors.js';
import { GetEnrollmentQuery } from './get-enrollment.query.js';

@QueryHandler(GetEnrollmentQuery)
export class GetEnrollmentHandler
  implements IQueryHandler<GetEnrollmentQuery, Result<EnrollmentDto, EnrollmentApplicationError>>
{
  constructor(
    @Inject(ENROLLMENT_REPOSITORY) private readonly repo: IEnrollmentRepository,
  ) {}

  async execute(query: GetEnrollmentQuery): Promise<Result<EnrollmentDto, EnrollmentApplicationError>> {
    const enrollment = await this.repo.findById(query.enrollmentId);
    if (!enrollment) {
      return Result.fail(new EnrollmentNotFoundError(query.enrollmentId));
    }

    if (enrollment.userId !== query.requestingUserId) {
      return Result.fail(new EnrollmentForbiddenError('access denied'));
    }

    return Result.ok(toEnrollmentDto(enrollment));
  }
}
