import type { School } from '../entities/school.entity.js';

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
}

export const SCHOOL_REPOSITORY = Symbol('SCHOOL_REPOSITORY');
