import type { Attempt } from '../entities/attempt.entity.js';

export const ATTEMPT_REPOSITORY = Symbol('IAttemptRepository');

export interface IAttemptRepository {
  findById(id: string): Promise<Attempt | null>;
  save(attempt: Attempt): Promise<void>;
}
