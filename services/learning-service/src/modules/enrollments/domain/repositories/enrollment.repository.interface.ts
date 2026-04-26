import type { Enrollment, EnrollmentStatus } from '../entities/enrollment.entity.js';

export const ENROLLMENT_REPOSITORY = Symbol('IEnrollmentRepository');

export interface FindByUserOptions {
  status?: EnrollmentStatus[];
  limit?: number;
  offset?: number;
}

export interface IEnrollmentRepository {
  findById(id: string): Promise<Enrollment | null>;
  findByUserAndContainer(userId: string, containerId: string): Promise<Enrollment | null>;
  findByUser(userId: string, options?: FindByUserOptions): Promise<Enrollment[]>;
  save(enrollment: Enrollment): Promise<void>;
  softDelete(id: string): Promise<void>;
}
