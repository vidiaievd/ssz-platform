import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ProfileNotFoundException } from '../../../domain/exceptions/profile-not-found.exception.js';
import type { IProfileRepository } from '../../../domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../domain/repositories/profile.repository.interface.js';
import { ProfileDto } from '../../dto/profile.dto.js';
import { GetProfileByUserIdQuery } from './get-profile-by-user-id.query.js';

@QueryHandler(GetProfileByUserIdQuery)
export class GetProfileByUserIdHandler implements IQueryHandler<
  GetProfileByUserIdQuery,
  ProfileDto
> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
  ) {}

  async execute(query: GetProfileByUserIdQuery): Promise<ProfileDto> {
    const profile = await this.profileRepository.findByUserId(query.userId);
    if (!profile) {
      throw new ProfileNotFoundException(query.userId);
    }

    const dto = new ProfileDto();
    dto.id = profile.id;
    dto.userId = profile.userId;
    dto.displayName = profile.displayName;
    dto.firstName = profile.firstName;
    dto.lastName = profile.lastName;
    dto.avatarUrl = profile.avatarUrl;
    dto.bio = profile.bio;
    dto.timezone = profile.timezone;
    dto.locale = profile.locale;
    dto.createdAt = profile.createdAt;
    dto.updatedAt = profile.updatedAt;
    return dto;
  }
}
