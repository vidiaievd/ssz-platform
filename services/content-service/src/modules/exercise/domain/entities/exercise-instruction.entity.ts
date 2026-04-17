import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../exceptions/exercise-domain.exceptions.js';

interface ExerciseInstructionProps {
  exerciseId: string;
  instructionLanguage: string;
  instructionText: string;
  hintText: string | null;
  // JSONB: keys are $$placeholder$$ tokens in content; values are per-language strings.
  // Content Service stores and returns as-is; frontend resolves substitution client-side.
  textOverrides: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExerciseInstructionProps {
  exerciseId: string;
  instructionLanguage: string;
  instructionText: string;
  hintText?: string;
  textOverrides?: Record<string, unknown>;
}

export interface UpdateExerciseInstructionProps {
  instructionText?: string;
  hintText?: string | null;
  textOverrides?: Record<string, unknown> | null;
}

export class ExerciseInstructionEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: ExerciseInstructionProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get exerciseId(): string {
    return this.props.exerciseId;
  }
  get instructionLanguage(): string {
    return this.props.instructionLanguage;
  }
  get instructionText(): string {
    return this.props.instructionText;
  }
  get hintText(): string | null {
    return this.props.hintText;
  }
  get textOverrides(): Record<string, unknown> | null {
    return this.props.textOverrides;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreateExerciseInstructionProps,
    id?: string,
  ): Result<ExerciseInstructionEntity, ExerciseDomainError> {
    if (!p.instructionText?.trim()) {
      return Result.fail(ExerciseDomainError.INVALID_EXERCISE_CONTENT);
    }

    const now = new Date();
    const entity = new ExerciseInstructionEntity(id ?? randomUUID(), {
      exerciseId: p.exerciseId,
      instructionLanguage: p.instructionLanguage,
      instructionText: p.instructionText,
      hintText: p.hintText ?? null,
      textOverrides: p.textOverrides ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: ExerciseInstructionProps): ExerciseInstructionEntity {
    return new ExerciseInstructionEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  update(changes: UpdateExerciseInstructionProps): Result<void, ExerciseDomainError> {
    if (changes.instructionText !== undefined && !changes.instructionText.trim()) {
      return Result.fail(ExerciseDomainError.INVALID_EXERCISE_CONTENT);
    }

    if (changes.instructionText !== undefined) {
      this.props.instructionText = changes.instructionText;
    }
    if ('hintText' in changes) {
      this.props.hintText = changes.hintText ?? null;
    }
    if ('textOverrides' in changes) {
      this.props.textOverrides = changes.textOverrides ?? null;
    }

    this.props.updatedAt = new Date();
    return Result.ok();
  }
}
