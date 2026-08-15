import type { Attempt, AttemptStatus } from '../entities/attempt.entity.js';

export const ATTEMPT_REPOSITORY = Symbol('IAttemptRepository');

export interface FindUserAttemptsFilter {
  exerciseId?: string;
  status?: AttemptStatus;
  limit: number;
  offset: number;
}

/** A review queue: submissions waiting on a person, oldest first. */
export interface FindForReviewFilter {
  status: AttemptStatus;
  limit: number;
  offset: number;
}

export interface IAttemptRepository {
  findById(id: string): Promise<Attempt | null>;
  findInProgress(userId: string, exerciseId: string): Promise<Attempt | null>;
  findAllInProgressByExercise(exerciseId: string): Promise<Attempt[]>;
  findAllByUser(userId: string, filter: FindUserAttemptsFilter): Promise<{ items: Attempt[]; total: number }>;
  /**
   * The queue across a set of exercises. One exercise is the set of one — the teacher's
   * screen for a whole course asks the same question of every exercise in it, and asking
   * once keeps the paging honest: twenty oldest submissions of the course, not twenty of
   * each exercise stitched together afterwards.
   */
  findAllByExercises(
    exerciseIds: string[],
    filter: FindForReviewFilter,
  ): Promise<{ items: Attempt[]; total: number }>;
  save(attempt: Attempt): Promise<void>;
  saveAll(attempts: Attempt[]): Promise<void>;
}
