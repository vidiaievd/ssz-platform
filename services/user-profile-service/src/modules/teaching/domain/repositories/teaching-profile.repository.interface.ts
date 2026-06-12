import type { TeachingProfile } from '../entities/teaching-profile.entity.js';

export const TEACHING_PROFILE_REPOSITORY = Symbol('TEACHING_PROFILE_REPOSITORY');

export interface ITeachingProfileRepository {
  findByProfileId(profileId: string): Promise<TeachingProfile | null>;
  save(profile: TeachingProfile): Promise<void>;
}
