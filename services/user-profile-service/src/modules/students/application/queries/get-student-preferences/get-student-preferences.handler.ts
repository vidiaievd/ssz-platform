import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import type { IStudentProfileRepository } from '../../../domain/repositories/student-profile.repository.interface.js';
import { STUDENT_PROFILE_REPOSITORY } from '../../../domain/repositories/student-profile.repository.interface.js';
import { StudentPreferencesResponseDto } from '../../../presentation/dto/student-preferences.response.dto.js';
import { GetStudentPreferencesQuery } from './get-student-preferences.query.js';

// A learner without a student part has chosen nothing yet: nulls, not 404.
@QueryHandler(GetStudentPreferencesQuery)
export class GetStudentPreferencesHandler implements IQueryHandler<GetStudentPreferencesQuery> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(STUDENT_PROFILE_REPOSITORY)
    private readonly studentProfileRepository: IStudentProfileRepository,
  ) {}

  async execute(
    query: GetStudentPreferencesQuery,
  ): Promise<StudentPreferencesResponseDto> {
    const profile = await this.profileRepository.findByUserId(query.userId);
    if (!profile) {
      throw new ProfileNotFoundException(query.userId);
    }

    const studentProfile = await this.studentProfileRepository.findByProfileId(
      profile.id,
    );
    return {
      dailyGoalMin: studentProfile?.dailyGoalMin ?? null,
      translationLanguage: studentProfile?.translationLanguage ?? null,
    };
  }
}
