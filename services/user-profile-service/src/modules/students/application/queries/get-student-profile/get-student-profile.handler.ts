import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { StudentProfileNotFoundException } from '../../../domain/exceptions/student-profile-not-found.exception.js';
import type { IStudentProfileRepository } from '../../../domain/repositories/student-profile.repository.interface.js';
import { STUDENT_PROFILE_REPOSITORY } from '../../../domain/repositories/student-profile.repository.interface.js';
import { StudentProfileResponseDto } from '../../../presentation/dto/student-profile.response.dto.js';
import { GetStudentProfileQuery } from './get-student-profile.query.js';

@QueryHandler(GetStudentProfileQuery)
export class GetStudentProfileHandler implements IQueryHandler<GetStudentProfileQuery> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(STUDENT_PROFILE_REPOSITORY)
    private readonly studentProfileRepository: IStudentProfileRepository,
  ) {}

  async execute(
    query: GetStudentProfileQuery,
  ): Promise<StudentProfileResponseDto> {
    const profile = await this.profileRepository.findByUserId(query.userId);
    if (!profile) {
      throw new ProfileNotFoundException(query.userId);
    }

    const studentProfile = await this.studentProfileRepository.findByProfileId(
      profile.id,
    );
    if (!studentProfile) {
      throw new StudentProfileNotFoundException(profile.id);
    }

    return {
      id: studentProfile.id,
      profileId: studentProfile.profileId,
      nativeLanguage: studentProfile.nativeLanguage,
      targetLanguages: studentProfile.targetLanguages,
      createdAt: studentProfile.createdAt.toISOString(),
      updatedAt: studentProfile.updatedAt.toISOString(),
    };
  }
}
