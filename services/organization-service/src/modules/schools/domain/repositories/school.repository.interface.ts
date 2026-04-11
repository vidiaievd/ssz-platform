import type { School } from '../entities/school.entity.js';

export interface ISchoolRepository {
  findById(id: string): Promise<School | null>;
  findByName(name: string): Promise<School | null>;
  findByOwnerId(ownerId: string): Promise<School[]>;
  findMemberSchools(userId: string): Promise<School[]>;
  save(school: School): Promise<void>;
}

export const SCHOOL_REPOSITORY = Symbol('SCHOOL_REPOSITORY');
