import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetReviewAiPolicyQuery } from './get-review-ai-policy.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import type {
  ReviewAiMode,
  ReviewAiPolicy,
} from '../../../domain/value-objects/review-ai-policy.vo.js';

export interface ReviewAiPolicyDto {
  mode: ReviewAiMode;
  autoAcceptAfterHours: number;
  samplePercent: number;
}

export function toReviewAiPolicyDto(policy: ReviewAiPolicy): ReviewAiPolicyDto {
  return {
    mode: policy.mode,
    autoAcceptAfterHours: policy.autoAcceptAfterHours,
    samplePercent: policy.samplePercent,
  };
}

/**
 * The policy as saved. Whether the plan still allows it is not answered here: a grant can
 * run out after the save, and exercise-engine asks subscription-service itself before it
 * lets a model answer (plan 80, R7) — so a lapsed plan falls back to the teacher there.
 */
@QueryHandler(GetReviewAiPolicyQuery)
export class GetReviewAiPolicyHandler implements IQueryHandler<GetReviewAiPolicyQuery> {
  constructor(@Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository) {}

  async execute(query: GetReviewAiPolicyQuery): Promise<ReviewAiPolicyDto> {
    const school = await this.schools.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);
    return toReviewAiPolicyDto(school.reviewAiPolicy);
  }
}
