import { FsrsScheduler } from '../../../../../src/modules/srs/infrastructure/scheduler/fsrs-scheduler.js';
import { ReviewCard } from '../../../../../src/modules/srs/domain/entities/review-card.entity.js';
import { ReviewRating } from '../../../../../src/modules/srs/domain/value-objects/review-rating.vo.js';

const USER_ID    = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const CONTENT_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';
const NOW = new Date('2026-04-29T10:00:00Z');

function makeScheduler(maxIntervalDays = 365): FsrsScheduler {
  const config = {
    get: (key: string) => {
      if (key === 'srs') return { maxIntervalDays };
      return undefined;
    },
  } as any;
  return new FsrsScheduler(config);
}

function newCard(): ReviewCard {
  return ReviewCard.create(USER_ID, 'EXERCISE', CONTENT_ID, NOW);
}

function reviewCard(): ReviewCard {
  return ReviewCard.reconstitute({
    id: '00000000-0000-4000-8000-000000000001',
    userId: USER_ID,
    contentType: 'EXERCISE',
    contentId: CONTENT_ID,
    state: 'REVIEW',
    dueAt: NOW,
    stability: 10.0,
    difficulty: 5.0,
    elapsedDays: 10,
    scheduledDays: 10,
    reps: 5,
    lapses: 0,
    learningSteps: 0,
    lastReviewedAt: new Date('2026-04-19T10:00:00Z'),
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: NOW,
  });
}

describe('FsrsScheduler', () => {
  describe('rating mapping — NEW card', () => {
    it('AGAIN on a NEW card produces LEARNING state', () => {
      const result = makeScheduler().schedule(newCard(), ReviewRating.AGAIN, NOW);
      expect(result.state).toBe('LEARNING');
    });

    it('GOOD on a NEW card produces LEARNING state', () => {
      const result = makeScheduler().schedule(newCard(), ReviewRating.GOOD, NOW);
      expect(result.state).toBe('LEARNING');
    });

    it('EASY on a NEW card produces REVIEW state (graduates immediately)', () => {
      const result = makeScheduler().schedule(newCard(), ReviewRating.EASY, NOW);
      expect(result.state).toBe('REVIEW');
    });

    it('schedule returns a dueAt date in the future for any rating', () => {
      for (const rating of [ReviewRating.AGAIN, ReviewRating.HARD, ReviewRating.GOOD, ReviewRating.EASY]) {
        const result = makeScheduler().schedule(newCard(), rating, NOW);
        expect(result.dueAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
      }
    });
  });

  describe('rating mapping — REVIEW card', () => {
    it('AGAIN on a REVIEW card produces RELEARNING state', () => {
      const result = makeScheduler().schedule(reviewCard(), ReviewRating.AGAIN, NOW);
      expect(result.state).toBe('RELEARNING');
    });

    it('EASY on a REVIEW card keeps REVIEW state with positive scheduledDays', () => {
      const result = makeScheduler().schedule(reviewCard(), ReviewRating.EASY, NOW);
      expect(result.state).toBe('REVIEW');
      expect(result.scheduledDays).toBeGreaterThan(0);
    });

    it('EASY produces a longer interval than HARD for the same card', () => {
      const scheduler = makeScheduler();
      const easyResult = scheduler.schedule(reviewCard(), ReviewRating.EASY, NOW);
      const hardResult = scheduler.schedule(reviewCard(), ReviewRating.HARD, NOW);
      expect(easyResult.scheduledDays).toBeGreaterThan(hardResult.scheduledDays);
    });
  });

  describe('maximum interval cap', () => {
    it('clamps HARD scheduledDays to SRS_MAX_INTERVAL_DAYS', () => {
      // Card with very high stability — FSRS would normally schedule 1000+ days.
      // We test HARD specifically: ts-fsrs guarantees scheduled_days <= maximum_interval
      // for HARD. GOOD/EASY can exceed the cap by 1-2 days due to the ordering constraint
      // (EASY > GOOD > HARD) that ts-fsrs enforces to ensure grades remain meaningful.
      const highStabilityCard = ReviewCard.reconstitute({
        id: '00000000-0000-4000-8000-000000000002',
        userId: USER_ID,
        contentType: 'EXERCISE',
        contentId: CONTENT_ID,
        state: 'REVIEW',
        dueAt: NOW,
        stability: 500.0,
        difficulty: 3.0,
        elapsedDays: 400,
        scheduledDays: 400,
        reps: 20,
        lapses: 0,
        learningSteps: 0,
        lastReviewedAt: new Date('2025-03-24T10:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: NOW,
      });

      const maxInterval = 7;
      const result = makeScheduler(maxInterval).schedule(highStabilityCard, ReviewRating.HARD, NOW);

      expect(result.scheduledDays).toBeLessThanOrEqual(maxInterval);
    });
  });

  describe('SchedulingResult shape', () => {
    it('returns all required fields', () => {
      const result = makeScheduler().schedule(newCard(), ReviewRating.GOOD, NOW);

      expect(result).toMatchObject({
        state: expect.any(String),
        dueAt: expect.any(Date),
        stability: expect.any(Number),
        difficulty: expect.any(Number),
        elapsedDays: expect.any(Number),
        scheduledDays: expect.any(Number),
        learningSteps: expect.any(Number),
      });
    });
  });
});
