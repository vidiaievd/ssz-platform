import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { TutorProfileNotFoundException } from '../../../domain/exceptions/tutor-profile-not-found.exception.js';
import type { ITutorProfileRepository } from '../../../domain/repositories/tutor-profile.repository.interface.js';
import { TUTOR_PROFILE_REPOSITORY } from '../../../domain/repositories/tutor-profile.repository.interface.js';
import { TutorProfileResponseDto } from '../../../presentation/dto/tutor-profile.response.dto.js';
import { GetTutorProfileQuery } from './get-tutor-profile.query.js';

@QueryHandler(GetTutorProfileQuery)
export class GetTutorProfileHandler implements IQueryHandler<GetTutorProfileQuery> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(TUTOR_PROFILE_REPOSITORY)
    private readonly tutorProfileRepository: ITutorProfileRepository,
  ) {}

  async execute(query: GetTutorProfileQuery): Promise<TutorProfileResponseDto> {
    const profile = await this.profileRepository.findByUserId(query.userId);
    if (!profile) {
      throw new ProfileNotFoundException(query.userId);
    }

    const tutorProfile = await this.tutorProfileRepository.findByProfileId(
      profile.id,
    );
    if (!tutorProfile) {
      throw new TutorProfileNotFoundException(profile.id);
    }

    return {
      id: tutorProfile.id,
      profileId: tutorProfile.profileId,
      hourlyRate: tutorProfile.hourlyRate,
      yearsOfExperience: tutorProfile.yearsOfExperience,
      teachingLanguages: tutorProfile.teachingLanguages,
      createdAt: tutorProfile.createdAt.toISOString(),
      updatedAt: tutorProfile.updatedAt.toISOString(),
    };
  }
}
