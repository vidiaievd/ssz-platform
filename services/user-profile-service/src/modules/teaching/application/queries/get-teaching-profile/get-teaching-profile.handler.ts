import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetTeachingProfileQuery } from './get-teaching-profile.query.js';
import { PROFILE_REPOSITORY, type IProfileRepository } from '../../../../profiles/domain/repositories/profile.repository.interface.js';
import { TEACHING_PROFILE_REPOSITORY, type ITeachingProfileRepository } from '../../../domain/repositories/teaching-profile.repository.interface.js';
import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import { TeachingProfileNotFoundException } from '../../../domain/exceptions/teaching-profile-not-found.exception.js';
import type { TeachingProfileResponseDto } from '../../../presentation/dto/teaching-profile.response.dto.js';

@QueryHandler(GetTeachingProfileQuery)
export class GetTeachingProfileHandler implements IQueryHandler<GetTeachingProfileQuery> {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: IProfileRepository,
    @Inject(TEACHING_PROFILE_REPOSITORY) private readonly teachingProfileRepository: ITeachingProfileRepository,
  ) {}

  async execute(query: GetTeachingProfileQuery): Promise<TeachingProfileResponseDto> {
    const profile = await this.profileRepository.findByUserId(query.userId);
    if (!profile) throw new ProfileNotFoundException(query.userId);

    const teachingProfile = await this.teachingProfileRepository.findByProfileId(profile.id);
    if (!teachingProfile) throw new TeachingProfileNotFoundException(query.userId);

    return {
      id: teachingProfile.id,
      userId: profile.userId,
      languages: teachingProfile.languages.map((l) => ({ code: l.code, level: l.level ?? null })),
      createdAt: teachingProfile.createdAt.toISOString(),
      updatedAt: teachingProfile.updatedAt.toISOString(),
    };
  }
}
