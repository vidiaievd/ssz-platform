import { randomUUID } from 'node:crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { Focus, Modality, Skill } from '@ssz/contracts';
import type { DifficultyLevel } from '../../../attempts/domain/entities/attempt.entity.js';
import type { AttemptItemTarget } from '../../../attempts/domain/entities/attempt.entity.js';
import {
  ProbeAlreadyPromotedError,
  ProbeExpiredError,
  ProbeNotYoursError,
} from '../exceptions/probe.errors.js';

/** Where the probe came from — a person assembling one, or the generator. */
export type ProbeSource = 'manual' | 'generated';

/**
 * The atom a probe was made to find out about.
 *
 * One, never a list. A task that examines three atoms at once answers nothing about any
 * of them: the learner who fails it has failed *something*, and which is exactly the
 * question the probe was asked to settle. Several `targets` are still allowed — a
 * sentence has words in it, and they are context — but the subject is singular by
 * construction.
 */
export interface ProbeSubject {
  atomType: string;
  atomId: string;
}

/** The exercise definition a probe carries, in the shape Content Service answers with. */
export interface ProbeDefinition {
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  content: unknown;
  expectedAnswers: unknown;
  answerCheckSettings: Record<string, unknown> | null;
  instruction: {
    language: string;
    text: string;
    hint: string | null;
    overrides: Record<string, unknown> | null;
  } | null;
}

export interface CreateProbeProps {
  userId: string;
  subject: ProbeSubject;
  requiredModality: Modality;
  definition: ProbeDefinition;
  skills?: Skill[];
  focus?: Focus[];
  targets?: AttemptItemTarget[];
  source?: ProbeSource;
  createdByUserId?: string | null;
  /** How long the probe is worth answering. Bounded by the caller, not by the entity. */
  ttlSeconds: number;
  now?: Date;
}

export interface RestoreProbeProps extends Omit<CreateProbeProps, 'ttlSeconds' | 'now'> {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  promotedExerciseId: string | null;
  promotedAt: Date | null;
}

/**
 * A disposable task, dealt to one learner, aimed at one atom, alive for a few hours
 * (plan 63 phase 9).
 *
 * The thing to keep hold of about this entity is what it is *not*. It is not an
 * exercise: nothing in a course points at it, no author maintains it, and it is gone by
 * tomorrow. It is not a card either — the memory of the atom lives in Learning Service
 * and outlives every probe ever asked about it. It is a **question**, and its whole
 * value is the answer it produces, which is spent the moment it is given.
 *
 * That is why the memory had to move onto the atom first (§2 A). While a card hung on an
 * exercise, a task that vanished took its own history with it, and nothing generated
 * could ever be used for anything. With the address in place a probe is free to be
 * thrown away: the evidence it produced has somewhere to live that is not itself.
 */
export class ProbeTask extends Entity<string> {
  private constructor(
    id: string,
    public readonly userId: string,
    public readonly subject: ProbeSubject,
    public readonly requiredModality: Modality,
    public readonly definition: ProbeDefinition,
    public readonly skills: Skill[],
    public readonly focus: Focus[],
    public readonly targets: AttemptItemTarget[],
    public readonly source: ProbeSource,
    public readonly createdByUserId: string | null,
    public readonly createdAt: Date,
    public readonly expiresAt: Date,
    private _promotedExerciseId: string | null,
    private _promotedAt: Date | null,
  ) {
    super(id);
  }

  static create(props: CreateProbeProps): ProbeTask {
    const now = props.now ?? new Date();

    return new ProbeTask(
      randomUUID(),
      props.userId,
      props.subject,
      props.requiredModality,
      props.definition,
      props.skills ?? [],
      props.focus ?? [],
      // The subject is the address when the builder names nothing finer — which is the
      // common case and the right default. A generated task is about the atom it was
      // generated from, and `focus` is what that means: the learner is being examined on
      // it, not merely walking past it. A builder that knows which piece of the task is
      // the examined one says so and this default is not used.
      normaliseTargets(props.targets, props.subject),
      props.source ?? 'manual',
      props.createdByUserId ?? null,
      now,
      new Date(now.getTime() + props.ttlSeconds * 1000),
      null,
      null,
    );
  }

  static restore(props: RestoreProbeProps): ProbeTask {
    return new ProbeTask(
      props.id,
      props.userId,
      props.subject,
      props.requiredModality,
      props.definition,
      props.skills ?? [],
      props.focus ?? [],
      props.targets ?? [],
      props.source ?? 'manual',
      props.createdByUserId ?? null,
      props.createdAt,
      props.expiresAt,
      props.promotedExerciseId,
      props.promotedAt,
    );
  }

  get promotedExerciseId(): string | null {
    return this._promotedExerciseId;
  }

  get promotedAt(): Date | null {
    return this._promotedAt;
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  /** Seconds left, floored at zero so a caller never has to handle a negative. */
  secondsRemaining(now: Date = new Date()): number {
    return Math.max(0, Math.floor((this.expiresAt.getTime() - now.getTime()) / 1000));
  }

  /**
   * May this person open it, and is it still worth opening.
   *
   * Both questions in one place because both have the same answer for the caller — the
   * probe does not open — and because separating them invites a reader to check one and
   * forget the other. Ownership is checked first: telling a stranger that someone else's
   * probe has expired says more than telling them it is not theirs.
   */
  openableBy(
    userId: string,
    now: Date = new Date(),
  ): Result<ProbeTask, ProbeExpiredError | ProbeNotYoursError> {
    if (this.userId !== userId) {
      return Result.fail<ProbeTask, ProbeNotYoursError>(new ProbeNotYoursError());
    }
    if (this.isExpired(now)) {
      return Result.fail<ProbeTask, ProbeExpiredError>(new ProbeExpiredError(this.expiresAt));
    }
    return Result.ok<ProbeTask, ProbeExpiredError | ProbeNotYoursError>(this);
  }

  /**
   * Someone decided this one was worth keeping, and it has been copied into the
   * catalogue as an exercise of its own.
   *
   * The probe does not become that exercise — it records which exercise it became, and
   * still expires on schedule. Provenance rather than identity: the promoted exercise is
   * maintained, versioned and placed like anything else an author writes, and a row that
   * disappears tomorrow is no place to keep its only copy.
   *
   * Refused twice over for the same reason: a second promotion would file a second
   * near-identical exercise, which is the catalogue rot this whole phase exists to
   * prevent.
   */
  promote(exerciseId: string, now: Date = new Date()): Result<void, ProbeAlreadyPromotedError> {
    if (this._promotedExerciseId !== null) {
      return Result.fail<void, ProbeAlreadyPromotedError>(
        new ProbeAlreadyPromotedError(this._promotedExerciseId),
      );
    }
    this._promotedExerciseId = exerciseId;
    this._promotedAt = now;
    return Result.ok<void, ProbeAlreadyPromotedError>();
  }
}

/**
 * The addresses, with the subject guaranteed to be among them.
 *
 * A builder that names its own targets may legitimately leave the subject out of them —
 * addressing three gaps, none of which is the atom the probe was made for — and that
 * would produce a probe whose evidence never reaches the atom it was asked about. So the
 * subject is appended rather than assumed present, unless the builder already addressed
 * it (in any role: a builder that deliberately called it `context` has said something,
 * and this is not the place to overrule it).
 */
function normaliseTargets(
  targets: AttemptItemTarget[] | undefined,
  subject: ProbeSubject,
): AttemptItemTarget[] {
  const given = targets ?? [];
  const addressesSubject = given.some(
    (t) => t.atomType === subject.atomType && t.atomId === subject.atomId,
  );
  if (addressesSubject) return given;

  return [
    ...given,
    { itemKey: null, atomType: subject.atomType, atomId: subject.atomId, role: 'focus' },
  ];
}
