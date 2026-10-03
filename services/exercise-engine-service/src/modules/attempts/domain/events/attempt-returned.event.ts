import { randomUUID } from 'node:crypto';
import type { AttemptTarget, Focus, Modality, Skill, WorkContext } from '@ssz/contracts';
import type { IDomainEvent } from '../../../../shared/domain/domain-event.interface.js';

/**
 * A person read the work and sent it back — plan 63 §4.
 *
 * Published on the same routing key as a scored attempt and shaped like one, because it
 * is the same kind of statement about the learner's language: someone qualified judged
 * the answer, and this time they judged it not good enough. `reviewOutcome: 'returned'`
 * is what tells the consumer apart the one thing that differs — the work is not done, so
 * this must move memory without moving progress.
 *
 * It exists because its absence was a bias, not a gap. An approval was recorded and a
 * return was not, so every piece of evidence the platform held about recall and
 * production was evidence of success, while recognition — auto-graded, and free to mark
 * an answer wrong — recorded failure too. Nothing said the two were sampled by opposite
 * rules; the numbers simply disagreed for a reason nobody could see.
 */
export interface AttemptReturnedPayload {
  userId: string;
  exerciseId: string;
  /**
   * What the verdict credited, on the same scale as an approval: the items the teacher
   * let stand out of the items they ruled on. A submission sent back with two of three
   * sentences approved is not the same failure as one sent back with none.
   */
  score: number;
  timeSpentSeconds: number;
  /** Never true: the learner has been asked to do it again. */
  completed: false;
  /** Never true: a return is a return, whatever partial credit it carries. */
  passed: false;
  reviewOutcome: 'returned';
  practicedAtoms: Array<{ atomType: string; atomId: string }>;
  skills: Skill[];
  focus: Focus[];
  containerId: string | null;
  workContext: WorkContext | null;
  groupId: string | null;
  lessonId: string | null;
  templateCode: string;
  /** The whole exercise's addresses — a free-form template grades as one (plan 63 §2 D). */
  targets?: AttemptTarget[];
  modality: Modality;
  /**
   * The task was a disposable probe (plan 63 phase 9).
   *
   * The consumer keeps the evidence about the atoms and writes nothing keyed by the
   * exercise: the id names a row that is meant to be gone tomorrow.
   */
  ephemeral: boolean;
}

export class AttemptReturnedEvent implements IDomainEvent {
  readonly eventId = randomUUID();
  readonly eventType = 'exercise.attempt.completed';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly payload: AttemptReturnedPayload,
  ) {}
}
