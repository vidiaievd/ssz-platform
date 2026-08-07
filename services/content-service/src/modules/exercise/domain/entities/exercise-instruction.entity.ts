import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../exceptions/exercise-domain.exceptions.js';

/**
 * An unreleased edit to the instruction a student reads, held on the same terms
 * as the exercise document itself: complete, not a patch, so publishing copies
 * rather than merges.
 */
export interface ExerciseInstructionDraft {
  instructionText: string;
  hintText: string | null;
  textOverrides: Record<string, unknown> | null;
  updatedAt: Date;
}

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
  // Null when nothing is waiting to be released.
  draft: ExerciseInstructionDraft | null;
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
  get draft(): ExerciseInstructionDraft | null {
    return this.props.draft;
  }

  // What the editor shows: the unreleased edit if there is one, else what is live.
  get authoringInstructionText(): string {
    return this.props.draft?.instructionText ?? this.props.instructionText;
  }
  get authoringHintText(): string | null {
    return this.props.draft ? this.props.draft.hintText : this.props.hintText;
  }
  get authoringTextOverrides(): Record<string, unknown> | null {
    return this.props.draft ? this.props.draft.textOverrides : this.props.textOverrides;
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
      draft: null,
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

    // Like the exercise document: the edit waits in the draft, and only
    // publishing the container puts it in front of a student.
    const draft: ExerciseInstructionDraft = {
      instructionText: changes.instructionText ?? this.authoringInstructionText,
      hintText: 'hintText' in changes ? (changes.hintText ?? null) : this.authoringHintText,
      textOverrides:
        'textOverrides' in changes ? (changes.textOverrides ?? null) : this.authoringTextOverrides,
      updatedAt: new Date(),
    };

    // An edit walked back to what is live leaves nothing to publish.
    this.props.draft = this.matchesLive(draft) ? null : draft;

    return Result.ok();
  }

  /** Releases the unreleased edit. Called by a publish, never by a save. */
  promoteDraft(): boolean {
    const draft = this.props.draft;
    if (draft === null) return false;

    this.props.instructionText = draft.instructionText;
    this.props.hintText = draft.hintText;
    this.props.textOverrides = draft.textOverrides;
    this.props.draft = null;
    this.props.updatedAt = new Date();

    return true;
  }

  /** Throws the unreleased edit away, leaving what students read untouched. */
  discardDraft(): void {
    this.props.draft = null;
  }

  private matchesLive(draft: ExerciseInstructionDraft): boolean {
    return (
      draft.instructionText === this.props.instructionText &&
      draft.hintText === this.props.hintText &&
      JSON.stringify(draft.textOverrides) === JSON.stringify(this.props.textOverrides)
    );
  }
}
