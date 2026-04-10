import type { TutorListResultDto } from '../../application/dto/tutor-list-item.dto.js';
import type { TutorProfile } from '../entities/tutor-profile.entity.js';

export interface TutorListFilters {
  languageCode?: string;
  maxHourlyRate?: number;
  limit: number;
  offset: number;
}

export interface ITutorProfileRepository {
  findByProfileId(profileId: string): Promise<TutorProfile | null>;
  save(tutorProfile: TutorProfile): Promise<void>;
  list(filters: TutorListFilters): Promise<TutorListResultDto>;
}

export const TUTOR_PROFILE_REPOSITORY = Symbol('TUTOR_PROFILE_REPOSITORY');
