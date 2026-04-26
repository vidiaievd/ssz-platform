import type { Submission, SubmissionStatus } from '../entities/submission.entity.js';

export const SUBMISSION_REPOSITORY = Symbol('ISubmissionRepository');

export interface FindByUserOptions {
  status?: SubmissionStatus[];
  limit?: number;
  offset?: number;
}

export interface FindPendingOptions {
  limit?: number;
  offset?: number;
}

export interface ISubmissionRepository {
  findById(id: string): Promise<Submission | null>;
  findByUser(userId: string, options?: FindByUserOptions): Promise<Submission[]>;
  findPendingBySchool(schoolId: string, options?: FindPendingOptions): Promise<Submission[]>;
  save(submission: Submission): Promise<void>;
  softDelete(id: string): Promise<void>;
}
