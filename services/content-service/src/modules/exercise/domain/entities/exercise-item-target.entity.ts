import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../exceptions/exercise-domain.exceptions.js';
import { AtomType, TargetRole } from '../value-objects/atom-type.vo.js';

interface ExerciseItemTargetProps {
  exerciseId: string;
  /** Null addresses the whole exercise — the only option for templates that grade as one. */
  itemKey: string | null;
  atomType: AtomType;
  atomId: string;
  role: TargetRole;
  createdAt: Date;
  createdByUserId: string;
}

export interface CreateExerciseItemTargetProps {
  exerciseId: string;
  itemKey: string | null;
  atomType: AtomType;
  atomId: string;
  role: TargetRole;
  createdByUserId: string;
}

const ITEM_KEY_MAX_LENGTH = 120;

export class ExerciseItemTarget extends Entity<string> {
  private constructor(
    id: string,
    private props: ExerciseItemTargetProps,
  ) {
    super(id);
  }

  get exerciseId(): string {
    return this.props.exerciseId;
  }
  get itemKey(): string | null {
    return this.props.itemKey;
  }
  get atomType(): AtomType {
    return this.props.atomType;
  }
  get atomId(): string {
    return this.props.atomId;
  }
  get role(): TargetRole {
    return this.props.role;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }

  static create(
    p: CreateExerciseItemTargetProps,
    id?: string,
  ): Result<ExerciseItemTarget, ExerciseDomainError> {
    // An empty string is not "the whole exercise" — it is a key nobody wrote. Normalising it
    // to null would quietly turn a bug in the caller into a target on the whole exercise.
    if (p.itemKey !== null) {
      const trimmed = p.itemKey.trim();
      if (trimmed.length === 0 || trimmed.length > ITEM_KEY_MAX_LENGTH) {
        return Result.fail(ExerciseDomainError.INVALID_TARGET_ITEM_KEY);
      }
    }

    return Result.ok(
      new ExerciseItemTarget(id ?? randomUUID(), {
        exerciseId: p.exerciseId,
        itemKey: p.itemKey === null ? null : p.itemKey.trim(),
        atomType: p.atomType,
        atomId: p.atomId,
        role: p.role,
        createdAt: new Date(),
        createdByUserId: p.createdByUserId,
      }),
    );
  }

  static reconstitute(id: string, props: ExerciseItemTargetProps): ExerciseItemTarget {
    return new ExerciseItemTarget(id, props);
  }
}
