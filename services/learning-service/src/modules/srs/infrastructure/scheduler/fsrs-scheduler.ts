import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FSRS, Grade, Rating, State, type Card } from 'ts-fsrs';
import type { ISrsScheduler } from '../../application/ports/srs-scheduler.port.js';
import type {
  ReviewCard,
  ReviewCardState,
  SchedulingResult,
} from '../../domain/entities/review-card.entity.js';
import type { ReviewRating, ReviewRatingValue } from '../../domain/value-objects/review-rating.vo.js';
import type { AppConfig } from '../../../../config/configuration.js';

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
    const maxInterval = config.get<AppConfig['srs']>('srs')?.maxIntervalDays ?? 365;
    // Passing maximum_interval to FSRS constructor is the canonical way to cap intervals.
    // The library clamps scheduled_days internally, so no post-processing is needed.
    this.fsrs = new FSRS({ maximum_interval: maxInterval });
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
