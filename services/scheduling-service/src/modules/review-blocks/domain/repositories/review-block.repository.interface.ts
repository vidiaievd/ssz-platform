import type { ReviewBlock, ReviewBlockRepeat } from '../entities/review-block.entity.js';

export const REVIEW_BLOCK_REPOSITORY = Symbol('IReviewBlockRepository');

export interface NewReviewBlock {
  schoolId: string;
  teacherId: string;
  repeat: ReviewBlockRepeat;
  startsOn: Date;
  endsOn: Date | null;
  startTime: string;
  endTime: string;
  note: string | null;
  createdBy: string;
}

export type ReviewBlockChanges = Partial<
  Pick<NewReviewBlock, 'repeat' | 'startsOn' | 'endsOn' | 'startTime' | 'endTime' | 'note'>
>;

export interface IReviewBlockRepository {
  findById(id: string): Promise<ReviewBlock | null>;
  /** Blocks of one teacher with at least one day in `from`..`to`, skips included. */
  findForTeacher(teacherId: string, from: Date, to: Date): Promise<ReviewBlock[]>;
  /** The same across a school — conflicts and load read every teacher at once. */
  findForSchool(schoolId: string, from: Date, to: Date): Promise<ReviewBlock[]>;
  create(block: NewReviewBlock): Promise<ReviewBlock>;
  update(id: string, changes: ReviewBlockChanges): Promise<ReviewBlock>;
  delete(id: string): Promise<void>;
  /** Idempotent: skipping a day already skipped changes nothing. */
  addSkip(id: string, date: Date): Promise<void>;
}
