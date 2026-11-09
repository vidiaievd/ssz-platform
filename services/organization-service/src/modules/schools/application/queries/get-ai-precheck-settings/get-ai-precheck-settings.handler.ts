import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetAiPrecheckSettingsQuery } from './get-ai-precheck-settings.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import type { AiPrecheckSettings } from '../../../domain/value-objects/ai-precheck-settings.vo.js';

export interface AiPrecheckSettingsDto {
  enabled: boolean;
  perExerciseLimit: number | null;
  perLearnerMonthlyCredits: number | null;
}

export function toAiPrecheckSettingsDto(settings: AiPrecheckSettings): AiPrecheckSettingsDto {
  return {
    enabled: settings.enabled,
    perExerciseLimit: settings.perExerciseLimit,
    perLearnerMonthlyCredits: settings.perLearnerMonthlyCredits,
  };
}

/**
 * The settings as saved. Whether the plan still allows them is not answered here, as with
 * the review policy: a grant can run out after the save, so exercise-engine asks
 * subscription-service for `ai.practice` before it offers a check, and lowers the monthly
 * limit to the plan's — and ai-service's gate holds the pool either way.
 */
@QueryHandler(GetAiPrecheckSettingsQuery)
export class GetAiPrecheckSettingsHandler implements IQueryHandler<GetAiPrecheckSettingsQuery> {
  constructor(@Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository) {}

  async execute(query: GetAiPrecheckSettingsQuery): Promise<AiPrecheckSettingsDto> {
    const settings = await this.schools.findAiPrecheckSettings(query.schoolId);
    if (!settings) throw new SchoolNotFoundException(query.schoolId);
    return toAiPrecheckSettingsDto(settings);
  }
}
