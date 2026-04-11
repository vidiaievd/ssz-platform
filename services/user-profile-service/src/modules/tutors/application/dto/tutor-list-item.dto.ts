import type { TeachingLanguage } from '../../domain/value-objects/teaching-language.vo.js';

export interface TutorListItemDto {
  profileId: string;
  userId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  hourlyRate?: number;
  yearsOfExperience?: number;
  teachingLanguages: TeachingLanguage[];
}

export interface TutorListResultDto {
  items: TutorListItemDto[];
  total: number;
  limit: number;
  offset: number;
}
