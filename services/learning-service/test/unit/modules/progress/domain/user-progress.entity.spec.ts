import { ContentRef } from '../../../../../src/shared/domain/value-objects/content-ref.js';
import { UserProgress } from '../../../../../src/modules/progress/domain/entities/user-progress.entity.js';
import {
  ProgressNotCompletedError,
  ProgressNotUnderReviewError,
} from '../../../../../src/modules/progress/domain/exceptions/progress.errors.js';

const NOW = new Date('2026-01-01T10:00:00Z');
const LATER = new Date('2026-01-01T11:00:00Z');

const LESSON_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

function makeRef(): ContentRef {
  return ContentRef.fromPersistence('LESSON', LESSON_ID);
}

function freshProgress(): UserProgress {
  return UserProgress.create('user-001', makeRef());
}

describe('UserProgress', () => {
  describe('create', () => {
    it('starts at NOT_STARTED with zero counters', () => {
      const p = freshProgress();
      expect(p.status).toBe('NOT_STARTED');
      expect(p.attemptsCount).toBe(0);
      expect(p.timeSpentSeconds).toBe(0);
      expect(p.score).toBeNull();
      expect(p.completedAt).toBeNull();
    });
  });

  describe('recordAttempt', () => {
    it('transitions NOT_STARTED → IN_PROGRESS on incomplete attempt', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 60, score: null, completed: false, now: NOW });

      expect(p.status).toBe('IN_PROGRESS');
      expect(p.attemptsCount).toBe(1);
      expect(p.timeSpentSeconds).toBe(60);
      expect(p.lastAttemptAt).toEqual(NOW);
    });

    it('accumulates time across multiple attempts', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 30, score: null, completed: false, now: NOW });
      p.recordAttempt({ timeSpentSeconds: 45, score: null, completed: false, now: LATER });

      expect(p.attemptsCount).toBe(2);
      expect(p.timeSpentSeconds).toBe(75);
    });

    it('transitions to COMPLETED on first completed attempt and emits ProgressCompletedEvent', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 120, score: 0.9, completed: true, now: NOW });

      expect(p.status).toBe('COMPLETED');
      expect(p.completedAt).toEqual(NOW);
      expect(p.score).toBe(0.9);

      const events = p.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.progress.completed');
    });

    it('stays COMPLETED on subsequent completed attempts and emits ProgressUpdatedEvent', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 120, score: 0.7, completed: true, now: NOW });
      p.clearDomainEvents();

      p.recordAttempt({ timeSpentSeconds: 60, score: 0.9, completed: true, now: LATER });

      expect(p.status).toBe('COMPLETED');
      expect(p.completedAt).toEqual(NOW); // first completion preserved
      expect(p.score).toBe(0.9);

      const events = p.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.progress.updated');
    });

    it('does not override existing score when new score is null', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 60, score: 0.8, completed: false, now: NOW });
      p.recordAttempt({ timeSpentSeconds: 30, score: null, completed: false, now: LATER });

      expect(p.score).toBe(0.8);
    });
  });

  describe('markNeedsReview', () => {
    it('transitions COMPLETED → NEEDS_REVIEW', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 100, score: 1, completed: true, now: NOW });

      const result = p.markNeedsReview(LATER);

      expect(result.isOk).toBe(true);
      expect(p.status).toBe('NEEDS_REVIEW');
      expect(p.needsReviewSince).toEqual(LATER);
    });

    it('fails when status is not COMPLETED', () => {
      const p = freshProgress();
      const result = p.markNeedsReview(NOW);

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(ProgressNotCompletedError);
    });
  });

  describe('resolveReview', () => {
    function completedAndUnderReview(): UserProgress {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 100, score: 1, completed: true, now: NOW });
      p.markNeedsReview(LATER);
      return p;
    }

    it('transitions NEEDS_REVIEW → COMPLETED when approved', () => {
      const p = completedAndUnderReview();
      const result = p.resolveReview(true, LATER);

      expect(result.isOk).toBe(true);
      expect(p.status).toBe('COMPLETED');
      expect(p.reviewResolvedAt).toEqual(LATER);
    });

    it('transitions NEEDS_REVIEW → IN_PROGRESS when rejected', () => {
      const p = completedAndUnderReview();
      const result = p.resolveReview(false, LATER);

      expect(result.isOk).toBe(true);
      expect(p.status).toBe('IN_PROGRESS');
    });

    it('fails when status is not NEEDS_REVIEW', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 100, score: 1, completed: true, now: NOW });

      const result = p.resolveReview(true, LATER);

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(ProgressNotUnderReviewError);
    });
  });
});
