import type { School } from '../entities/school.entity.js';
import type { ReviewSettings } from '../value-objects/review-settings.vo.js';

export interface PublicSchoolFilter {
  q?: string;
  type?: 'ONLINE' | 'HYBRID';
  cursor?: string;
  limit: number;
}

export interface PublicSchoolPage {
  items: School[];
  total: number;
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface PublicTeacherEntry {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PublicSchoolDetail {
  school: School;
  studentCount: number;
  levels: string[];
  teachers: PublicTeacherEntry[];
}

export interface ISchoolRepository {
  findById(id: string): Promise<School | null>;
  findBySlug(slug: string): Promise<School | null>;
  findByName(name: string): Promise<School | null>;
  findByOwnerId(ownerId: string): Promise<School[]>;
  findMemberSchools(userId: string): Promise<School[]>;
  findAllActive(): Promise<School[]>;
  findPublicFiltered(filter: PublicSchoolFilter): Promise<PublicSchoolPage>;
  findPublicSchoolDetail(slug: string): Promise<PublicSchoolDetail | null>;
  findManagerCapabilities(userId: string, schoolIds: string[]): Promise<Map<string, string[]>>;
  save(school: School): Promise<void>;
  /**
   * Writes only the response promise.
   *
   * `save` rewrites the whole roster — it deletes every member row and recreates them —
   * which is a great deal to do to a school because an administrator moved a deadline
   * from 48 hours to 24.
   */
  saveReviewSettings(schoolId: string, settings: ReviewSettings): Promise<void>;
}

export const SCHOOL_REPOSITORY = Symbol('SCHOOL_REPOSITORY');
