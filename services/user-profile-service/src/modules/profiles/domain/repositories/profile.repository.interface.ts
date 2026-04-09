import { Profile } from '../entities/profile.entity.js';

export interface IProfileRepository {
  findById(id: string): Promise<Profile | null>;
  findByUserId(userId: string): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
  softDelete(id: string): Promise<void>;
}

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY');
