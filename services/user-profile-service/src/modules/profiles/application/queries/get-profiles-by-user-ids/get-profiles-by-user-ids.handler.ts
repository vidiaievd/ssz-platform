import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { IProfileRepository } from '../../../domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../domain/repositories/profile.repository.interface.js';
import { GetProfilesByUserIdsQuery } from './get-profiles-by-user-ids.query.js';

const BATCH_LIMIT = 100;

export interface ProfileSummary {
  userId: string;
  displayName: string;
  firstName: string | undefined;
  lastName: string | undefined;
  avatarUrl: string | undefined;
}

@QueryHandler(GetProfilesByUserIdsQuery)
export class GetProfilesByUserIdsHandler implements IQueryHandler<GetProfilesByUserIdsQuery, ProfileSummary[]> {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
  ) {}

  async execute(query: GetProfilesByUserIdsQuery): Promise<ProfileSummary[]> {
    const ids = query.userIds.slice(0, BATCH_LIMIT);
    const profiles = await this.profileRepository.findByUserIds(ids);
    return profiles.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      firstName: p.firstName,
      lastName: p.lastName,
      avatarUrl: p.avatarUrl,
    }));
  }
}
