import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetReviewSettingsQuery } from './get-review-settings.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import type { ReviewEscalationTarget } from '../../../domain/value-objects/review-settings.vo.js';

export interface ReviewSettingsDto {
  respondWithinHours: number;
  escalateAfterHours: number;
  escalateTo: ReviewEscalationTarget;
}

/**
 * The promise, read.
 *
 * No authorisation of its own: a school's promised response time is not a secret from
 * anyone it is made to, and the two callers — the school's own settings screen and
 * content-service resolving what a course inherits — are both entitled to it.
 */
@QueryHandler(GetReviewSettingsQuery)
export class GetReviewSettingsHandler implements IQueryHandler<GetReviewSettingsQuery> {
  constructor(@Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository) {}

  async execute(query: GetReviewSettingsQuery): Promise<ReviewSettingsDto> {
    const school = await this.schools.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);

    const settings = school.reviewSettings;
    return {
      respondWithinHours: settings.respondWithinHours,
      escalateAfterHours: settings.escalateAfterHours,
      escalateTo: settings.escalateTo,
    };
  }
}
