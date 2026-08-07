import { randomUUID } from 'node:crypto';
import type { AnswerForm } from '@ssz/contracts';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

// Payload matches Learning Service ExerciseAttemptedConsumer contract exactly.
// Published as routing key: exercise.attempt.completed
export interface AttemptScoredPayload {
  userId: string;
  exerciseId: string;
  score: number;
  timeSpentSeconds: number;
  completed: true;
  // PRACTICED_BY atoms snapshotted from Content Service at attempt start (plan 21 §3
  // fan-out) — lets the consumer rate the related VOCABULARY_WORD SRS cards without
  // a cross-service call in the hot path.
  practicedAtoms: Array<{ atomType: string; atomId: string }>;
  // How the answer was produced, as opposed to whether it was right. Present only
  // for templates that can say — today, word_bank_gap_fill. See @ssz/contracts.
  answerForm?: AnswerForm;
  // Calibration context for the SRS evidence scale (plan 36 §A.1). The consumer
  // records these next to the rating it derives, so the scale can later be judged
  // against what it actually did rather than against what it was meant to do.
  templateCode: string;
  passed: boolean;
}

export class AttemptScoredEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'exercise.attempt.completed';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AttemptScoredPayload,
  ) {}
}
