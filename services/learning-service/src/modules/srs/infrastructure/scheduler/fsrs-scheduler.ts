import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FSRS, Grade, Rating, State, type Card } from 'ts-fsrs';
import type { ISrsScheduler, PredictedInterval } from '../../application/ports/srs-scheduler.port.js';
import type {
  ReviewCard,
  ReviewCardState,
  SchedulingResult,
} from '../../domain/entities/review-card.entity.js';
import type { ReviewRating, ReviewRatingValue } from '../../domain/value-objects/review-rating.vo.js';
import type { AppConfig } from '../../../../config/configuration.js';
import { SSZ_FSRS_PROFILE } from './fsrs-profile.js';

function toFsrsGrade(value: ReviewRatingValue): Grade {
  switch (value) {
    case 'AGAIN': return Rating.Again;
    case 'HARD':  return Rating.Hard;
    case 'GOOD':  return Rating.Good;
    case 'EASY':  return Rating.Easy;
  }
}

function fromFsrsState(state: State): ReviewCardState {
  switch (state) {
    case State.New:        return 'NEW';
    case State.Learning:   return 'LEARNING';
    case State.Review:     return 'REVIEW';
    case State.Relearning: return 'RELEARNING';
    // ts-fsrs has no Suspended state; this branch is unreachable in normal flow.
    default:               return 'REVIEW';
  }
}

@Injectable()
export class FsrsScheduler implements ISrsScheduler {
  private readonly fsrs: FSRS;

  constructor(private readonly config: ConfigService<AppConfig>) {
    // Every parameter comes from the frozen profile rather than ts-fsrs defaults,
    // so a library upgrade cannot silently reschedule existing cards. See
    // fsrs-profile.ts. SRS_MAX_INTERVAL_DAYS stays overridable for operations;
    // an override is a deliberate divergence from the profile's cap.
    // Passing maximum_interval to FSRS constructor is the canonical way to cap intervals.
    // The library clamps scheduled_days internally, so no post-processing is needed.
    const maxInterval =
      config.get<AppConfig['srs']>('srs')?.maxIntervalDays ??
      SSZ_FSRS_PROFILE.maximumIntervalDays;

    this.fsrs = new FSRS({
      w: [...SSZ_FSRS_PROFILE.w],
      request_retention: SSZ_FSRS_PROFILE.requestRetention,
      maximum_interval: maxInterval,
      enable_short_term: SSZ_FSRS_PROFILE.enableShortTerm,
      enable_fuzz: SSZ_FSRS_PROFILE.enableFuzz,
      learning_steps: [...SSZ_FSRS_PROFILE.learningSteps],
      relearning_steps: [...SSZ_FSRS_PROFILE.relearningSteps],
    });
  }

  schedule(card: ReviewCard, rating: ReviewRating, reviewedAt: Date): SchedulingResult {
    const fsrsCard: Card = {
      due: card.dueAt,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsedDays,
      scheduled_days: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      learning_steps: card.learningSteps,
      state: this.toFsrsState(card.state),
      last_review: card.lastReviewedAt ?? undefined,
    };

    const grade = toFsrsGrade(rating.value);
    const { card: next } = this.fsrs.next(fsrsCard, reviewedAt, grade);

    return {
      state: fromFsrsState(next.state),
      dueAt: next.due,
      stability: next.stability,
      difficulty: next.difficulty,
      elapsedDays: next.elapsed_days,
      scheduledDays: next.scheduled_days,
      learningSteps: next.learning_steps,
    };
  }

  getRetrievability(card: ReviewCard, now: Date): number {
    // A card that has never been reviewed has no forgetting curve yet.
    if (card.state === 'NEW') return 0;

    const fsrsCard: Card = {
      due: card.dueAt,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsedDays,
      scheduled_days: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      learning_steps: card.learningSteps,
      state: this.toFsrsState(card.state),
      last_review: card.lastReviewedAt ?? undefined,
    };

    return this.fsrs.get_retrievability(fsrsCard, now, false);
  }

  predictIntervals(card: ReviewCard, now: Date): PredictedInterval[] {
    const fsrsCard: Card = {
      due: card.dueAt,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsedDays,
      scheduled_days: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      learning_steps: card.learningSteps,
      state: this.toFsrsState(card.state),
      last_review: card.lastReviewedAt ?? undefined,
    };

    const preview = this.fsrs.repeat(fsrsCard, now);
    const ratings: Array<[Grade, 'AGAIN' | 'HARD' | 'GOOD' | 'EASY']> = [
      [Rating.Again, 'AGAIN'],
      [Rating.Hard, 'HARD'],
      [Rating.Good, 'GOOD'],
      [Rating.Easy, 'EASY'],
    ];

    return ratings.map(([grade, name]) => {
      const scheduledDays = preview[grade].card.scheduled_days;
      return { rating: name, scheduledDays, label: this.formatInterval(scheduledDays) };
    });
  }

  private formatInterval(days: number): string {
    if (days < 1) return '< 1 day';
    if (days === 1) return '1 day';
    if (days < 14) return `${days} days`;
    if (days < 60) return `${Math.round(days / 7)} weeks`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    return `${Math.round(days / 365)} years`;
  }

  private toFsrsState(state: ReviewCardState): State {
    switch (state) {
      case 'NEW':        return State.New;
      case 'LEARNING':   return State.Learning;
      case 'REVIEW':     return State.Review;
      case 'RELEARNING': return State.Relearning;
      // SUSPENDED is our own state; FSRS never sees it (review() guards against this).
      case 'SUSPENDED':  return State.Review;
    }
  }
}
