import type { SchoolMembership, MembershipStatus } from '../entities/school-membership.entity.js';

export const SCHOOL_MEMBERSHIP_REPOSITORY = Symbol('SCHOOL_MEMBERSHIP_REPOSITORY');

export interface ListMembershipsOptions {
  schoolId: string;
  status?: MembershipStatus;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ISchoolMembershipRepository {
  save(membership: SchoolMembership): Promise<void>;
  findById(id: string): Promise<SchoolMembership | null>;
  findBySchoolAndStudent(schoolId: string, studentId: string): Promise<SchoolMembership | null>;
  list(options: ListMembershipsOptions): Promise<{ items: SchoolMembership[]; nextCursor: string | null }>;
}
