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

  describe('completed on a model’s verdict (plan 79 §2.1)', () => {
    it('marks a first completion reached on a model’s verdict', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 30, score: 90, completed: true, byAi: true, now: NOW });
      expect(p.status).toBe('COMPLETED');
      expect(p.completedByAi).toBe(true);
    });

    it('clears the mark once a person or the machine passes it too', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 30, score: 90, completed: true, byAi: true, now: NOW });
      p.recordAttempt({ timeSpentSeconds: 30, score: 80, completed: true, now: LATER });
      expect(p.completedByAi).toBe(false);
    });

    it('never marks a completion a stronger verdict already reached', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 30, score: 80, completed: true, now: NOW });
      p.recordAttempt({ timeSpentSeconds: 30, score: 90, completed: true, byAi: true, now: LATER });
      expect(p.completedByAi).toBe(false);
    });

    it('is not touched by an attempt that does not complete', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 30, score: 90, completed: true, byAi: true, now: NOW });
      p.recordAttempt({ timeSpentSeconds: 30, score: 20, completed: false, now: LATER });
      expect(p.completedByAi).toBe(true);
    });
  });

  describe('recordAttempt', () => {
    it('an attempt made earlier and arriving later keeps neither its score nor its time', () => {
      // Worked offline at NOW and synced after an online attempt at LATER (VoxOrd offline
      // plan, B4): it counts, and the record still reads as the later attempt left it.
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 30, score: 90, completed: false, now: LATER });
      p.recordAttempt({ timeSpentSeconds: 40, score: 40, completed: false, now: NOW });

      expect(p.attemptsCount).toBe(2);
      expect(p.timeSpentSeconds).toBe(70);
      expect(p.score).toBe(90);
      expect(p.lastAttemptAt).toEqual(LATER);
    });

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

    it('once passed, a later failure moves the score and not the status (plan 76, Q2-A)', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 60, score: 90, completed: true, now: NOW });
      p.recordAttempt({ timeSpentSeconds: 60, score: 30, completed: false, now: LATER });

      expect(p.status).toBe('COMPLETED');
      expect(p.score).toBe(30);
    });

    it('work handed to a teacher is SUBMITTED, and an approval completes it', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 60, score: null, completed: false, awaitingReview: true, now: NOW });
      expect(p.status).toBe('SUBMITTED');
      expect(p.completedAt).toBeNull();

      p.recordAttempt({ timeSpentSeconds: 0, score: 80, completed: true, now: LATER });
      expect(p.status).toBe('COMPLETED');
    });

    it('a resubmission of something already passed leaves it passed', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 60, score: 90, completed: true, now: NOW });
      p.recordAttempt({ timeSpentSeconds: 60, score: null, completed: false, awaitingReview: true, now: LATER });

      expect(p.status).toBe('COMPLETED');
    });
  });

  describe('recordReturn', () => {
    it('sends a submission back to IN_PROGRESS without counting an attempt', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 60, score: null, completed: false, awaitingReview: true, now: NOW });
      p.clearDomainEvents();

      p.recordReturn();

      expect(p.status).toBe('IN_PROGRESS');
      expect(p.attemptsCount).toBe(1);
      expect(p.getDomainEvents().map((e) => e.eventType)).toEqual(['learning.progress.updated']);
    });

    it('leaves anything that is not waiting for a verdict alone', () => {
      const p = freshProgress();
      p.recordAttempt({ timeSpentSeconds: 60, score: 90, completed: true, now: NOW });
      p.clearDomainEvents();

      p.recordReturn();

      expect(p.status).toBe('COMPLETED');
      expect(p.getDomainEvents()).toHaveLength(0);
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
