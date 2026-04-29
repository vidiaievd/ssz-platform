import type { UserProgress } from '../entities/user-progress.entity.js';
import type { ContentRef } from '../../../../shared/domain/value-objects/content-ref.js';

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
  // Returns count of COMPLETED progress records for the user across the given content refs.
  findCompletedCountForUser(userId: string, refs: ContentRef[]): Promise<number>;
  save(progress: UserProgress): Promise<void>;
}
