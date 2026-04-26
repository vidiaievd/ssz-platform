import type { UserProgress } from '../entities/user-progress.entity.js';

export const PROGRESS_REPOSITORY = Symbol('IProgressRepository');

export interface FindByUserOptions {
  contentType?: string;
  limit?: number;
  offset?: number;
}

export interface IProgressRepository {
  findById(id: string): Promise<UserProgress | null>;
  findByUserAndContent(userId: string, contentType: string, contentId: string): Promise<UserProgress | null>;
  findByUser(userId: string, options?: FindByUserOptions): Promise<UserProgress[]>;
  save(progress: UserProgress): Promise<void>;
}
