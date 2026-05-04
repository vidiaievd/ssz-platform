import { ReviewCard, type SchedulingResult } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import { ReviewRating } from '../../../../../src/modules/srs/domain/value-objects/review-rating.vo.js';
import { CardSuspendedError } from '../../../../../src/modules/srs/domain/exceptions/srs.errors.js';

const NOW   = new Date('2026-04-29T10:00:00Z');
const LATER = new Date('2026-05-06T10:00:00Z');

const USER_ID    = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const CONTENT_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

function freshCard(): ReviewCard {
  return ReviewCard.create(USER_ID, 'EXERCISE', CONTENT_ID, NOW);
}

function schedulingResult(overrides: Partial<SchedulingResult> = {}): SchedulingResult {
  return {
    state: 'LEARNING',
    dueAt: LATER,
    stability: 1.5,
    difficulty: 5.0,
    elapsedDays: 0,
    scheduledDays: 1,
    learningSteps: 1,
    ...overrides,
  };
}

describe('ReviewCard', () => {
  describe('create', () => {
    it('starts in NEW state with all counters at zero', () => {
      const card = freshCard();
      expect(card.state).toBe('NEW');
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
      expect(card.lastReviewedAt).toBeNull();
      expect(card.dueAt).toEqual(NOW);
    });

    it('emits ReviewCardCreatedEvent on creation', () => {
      const card = freshCard();
      const events = card.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.srs.card.created');
      expect((events[0] as any).payload.userId).toBe(USER_ID);
      expect((events[0] as any).payload.contentType).toBe('EXERCISE');
      expect((events[0] as any).payload.contentId).toBe(CONTENT_ID);
    });
  });

  describe('review', () => {
    it('applies scheduling result and increments reps on success', () => {
      const card = freshCard();
      card.clearDomainEvents();
      const result = card.review(ReviewRating.GOOD, schedulingResult(), NOW);

      expect(result.isOk).toBe(true);
      expect(card.state).toBe('LEARNING');
      expect(card.dueAt).toEqual(LATER);
      expect(card.stability).toBe(1.5);
      expect(card.reps).toBe(1);
      expect(card.lastReviewedAt).toEqual(NOW);
    });

    it('emits ReviewCardReviewedEvent with correct payload', () => {
      const card = freshCard();
      card.clearDomainEvents();
      card.review(ReviewRating.GOOD, schedulingResult(), NOW);

      const events = card.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.srs.card.reviewed');
      const payload = (events[0] as any).payload;
      expect(payload.rating).toBe('GOOD');
      expect(payload.newState).toBe('LEARNING');
      expect(payload.scheduledDays).toBe(1);
    });

    it('increments lapses when a REVIEW-state card is rated AGAIN', () => {
      const card = ReviewCard.reconstitute({
        id: '00000000-0000-4000-8000-000000000001',
        userId: USER_ID,
        contentType: 'EXERCISE',
        contentId: CONTENT_ID,
        state: 'REVIEW',
        dueAt: NOW,
        stability: 4.0,
        difficulty: 5.0,
        elapsedDays: 7,
        scheduledDays: 7,
        reps: 3,
        lapses: 0,
        learningSteps: 0,
        lastReviewedAt: new Date('2026-04-22T10:00:00Z'),
        createdAt: NOW,
        updatedAt: NOW,
      });

      card.review(ReviewRating.AGAIN, schedulingResult({ state: 'RELEARNING' }), NOW);

      expect(card.lapses).toBe(1);
    });

    it('does not increment lapses when a LEARNING-state card is rated AGAIN', () => {
      const card = freshCard();
      card.review(ReviewRating.AGAIN, schedulingResult({ state: 'LEARNING' }), NOW);
      expect(card.lapses).toBe(0);
    });

    it('returns CardSuspendedError for a suspended card', () => {
      const card = freshCard();
      card.suspend(NOW);
      card.clearDomainEvents();

      const result = card.review(ReviewRating.GOOD, schedulingResult(), NOW);

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(CardSuspendedError);
    });

    it('emits no event when review fails', () => {
      const card = freshCard();
      card.suspend(NOW);
      card.clearDomainEvents();

      card.review(ReviewRating.GOOD, schedulingResult(), NOW);

      expect(card.getDomainEvents()).toHaveLength(0);
    });
  });

  describe('suspend', () => {
    it('transitions state to SUSPENDED and emits event with suspended=true', () => {
      const card = freshCard();
      card.clearDomainEvents();
      card.suspend(NOW);

      expect(card.state).toBe('SUSPENDED');
      const events = card.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.srs.card.suspended');
      expect((events[0] as any).payload.suspended).toBe(true);
    });
  });

  describe('unsuspend', () => {
    it('transitions state to REVIEW, sets dueAt to now, and emits event with suspended=false', () => {
      const card = freshCard();
      card.suspend(NOW);
      card.clearDomainEvents();

      card.unsuspend(LATER);

      expect(card.state).toBe('REVIEW');
      expect(card.dueAt).toEqual(LATER);
      const events = card.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('learning.srs.card.suspended');
      expect((events[0] as any).payload.suspended).toBe(false);
    });
  });

  describe('reconstitute', () => {
    it('restores all fields exactly', () => {
      const card = ReviewCard.reconstitute({
        id: '00000000-0000-4000-8000-000000000001',
        userId: USER_ID,
        contentType: 'VOCABULARY_WORD',
        contentId: CONTENT_ID,
        state: 'REVIEW',
        dueAt: LATER,
        stability: 9.2,
        difficulty: 4.1,
        elapsedDays: 14,
        scheduledDays: 14,
        reps: 5,
        lapses: 1,
        learningSteps: 0,
        lastReviewedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });

      expect(card.state).toBe('REVIEW');
      expect(card.stability).toBe(9.2);
      expect(card.reps).toBe(5);
      expect(card.lapses).toBe(1);
      expect(card.getDomainEvents()).toHaveLength(0); // reconstitute emits nothing
    });
  });
});
