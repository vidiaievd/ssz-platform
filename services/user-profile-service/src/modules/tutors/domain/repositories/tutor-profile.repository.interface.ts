import type { TutorProfile } from '../entities/tutor-profile.entity.js';

export interface ITutorProfileRepository {
  findByProfileId(profileId: string): Promise<TutorProfile | null>;
  save(tutorProfile: TutorProfile): Promise<void>;
}

export const TUTOR_PROFILE_REPOSITORY = Symbol('TUTOR_PROFILE_REPOSITORY');
