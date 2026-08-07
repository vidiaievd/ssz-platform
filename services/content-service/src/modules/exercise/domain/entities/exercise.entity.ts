import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import {
  Visibility,
  getValidVisibilities,
} from '../../../container/domain/value-objects/visibility.vo.js';
import { ExerciseTemplateEntity } from '../../../exercise-template/domain/entities/exercise-template.entity.js';
import { ExerciseContentValidatorService } from '../services/exercise-content-validator.service.js';
import { ExerciseDomainError } from '../exceptions/exercise-domain.exceptions.js';
import { ExerciseCreatedEvent } from '../events/exercise-created.event.js';
import { ExerciseUpdatedEvent } from '../events/exercise-updated.event.js';
import { ExerciseDeletedEvent } from '../events/exercise-deleted.event.js';
import { ExerciseInstructionEntity } from './exercise-instruction.entity.js';

/**
 * An edit that has not been released yet — the whole document, not a patch.
 *
 * Materialised in full so that promoting it is a copy rather than a merge: a
 * publish that had to reconstruct "content from the draft, settings from the
 * live row" would depend on the order edits happened to arrive in.
 */
export interface ExerciseDraft {
  content: Record<string, unknown>;
  expectedAnswers: Record<string, unknown>;
  answerCheckSettings: Record<string, unknown> | null;
  updatedAt: Date;
}

interface ExerciseProps {
  exerciseTemplateId: string;
  // Stored separately for event payloads and display without joining template.
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  content: Record<string, unknown>;
  expectedAnswers: Record<string, unknown>;
  answerCheckSettings: Record<string, unknown> | null;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: Visibility;
  estimatedDurationSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // Null when nothing is waiting to be released.
  draft: ExerciseDraft | null;
  // Loaded on demand — null means not yet fetched.
  instructions: ExerciseInstructionEntity[] | null;
}

export interface CreateExerciseProps {
  exerciseTemplateId: string;
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  content: Record<string, unknown>;
  expectedAnswers: Record<string, unknown>;
  answerCheckSettings?: Record<string, unknown>;
  ownerUserId: string;
  ownerSchoolId?: string;
  visibility: Visibility;
  estimatedDurationSeconds?: number;
}

export interface UpdateExerciseProps {
  difficultyLevel?: DifficultyLevel;
  content?: Record<string, unknown>;
  expectedAnswers?: Record<string, unknown>;
  answerCheckSettings?: Record<string, unknown> | null;
  visibility?: Visibility;
  estimatedDurationSeconds?: number | null;
}

export class ExerciseEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: ExerciseProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get exerciseTemplateId(): string {
    return this.props.exerciseTemplateId;
  }
  get templateCode(): string {
    return this.props.templateCode;
  }
  get targetLanguage(): string {
    return this.props.targetLanguage;
  }
  get difficultyLevel(): DifficultyLevel {
    return this.props.difficultyLevel;
  }
  get content(): Record<string, unknown> {
    return this.props.content;
  }
  get expectedAnswers(): Record<string, unknown> {
    return this.props.expectedAnswers;
  }
  get answerCheckSettings(): Record<string, unknown> | null {
    return this.props.answerCheckSettings;
  }
  get ownerUserId(): string {
    return this.props.ownerUserId;
  }
  get ownerSchoolId(): string | null {
    return this.props.ownerSchoolId;
  }
  get visibility(): Visibility {
    return this.props.visibility;
  }
  get estimatedDurationSeconds(): number | null {
    return this.props.estimatedDurationSeconds;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get instructions(): ExerciseInstructionEntity[] | null {
    return this.props.instructions;
  }
  get draft(): ExerciseDraft | null {
    return this.props.draft;
  }
  get hasDraft(): boolean {
    return this.props.draft !== null;
  }

  // ── Authoring view ────────────────────────────────────────────────────────
  // What the editor must show and validate: the unreleased edit when there is
  // one, the live document otherwise. Students and the grading engine read the
  // plain getters above, which is the whole point of the split.

  get authoringContent(): Record<string, unknown> {
    return this.props.draft?.content ?? this.props.content;
  }
  get authoringExpectedAnswers(): Record<string, unknown> {
    return this.props.draft?.expectedAnswers ?? this.props.expectedAnswers;
  }
  get authoringAnswerCheckSettings(): Record<string, unknown> | null {
    return this.props.draft ? this.props.draft.answerCheckSettings : this.props.answerCheckSettings;
  }
  /**
   * The token an autosaving editor carries. It has to follow the draft: two
   * writes in a row would otherwise both compare against the untouched live
   * `updatedAt` and neither would ever be refused.
   */
  get contentUpdatedAt(): Date {
    return this.props.draft?.updatedAt ?? this.props.updatedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  /**
   * Creates a new exercise.
   * Validates content and answers against the template schemas.
   * The templateEntity must already be verified as active and language-compatible
   * by the command handler before calling this.
   */
  static create(
    p: CreateExerciseProps,
    templateEntity: ExerciseTemplateEntity,
    id?: string,
  ): Result<ExerciseEntity, ExerciseDomainError> {
    const validVisibilities = getValidVisibilities(!!p.ownerSchoolId);
    if (!validVisibilities.includes(p.visibility)) {
      return Result.fail(ExerciseDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
    }

    const contentValidation = ExerciseContentValidatorService.validate(
      p.content,
      templateEntity.contentSchema,
    );
    if (contentValidation.isFail) {
      return Result.fail(contentValidation.error);
    }

    const answersValidation = ExerciseContentValidatorService.validateAnswers(
      p.expectedAnswers,
      templateEntity.answerSchema,
    );
    if (answersValidation.isFail) {
      return Result.fail(answersValidation.error);
    }

    const now = new Date();
    const entity = new ExerciseEntity(id ?? randomUUID(), {
      exerciseTemplateId: p.exerciseTemplateId,
      templateCode: p.templateCode,
      targetLanguage: p.targetLanguage,
      difficultyLevel: p.difficultyLevel,
      content: p.content,
      expectedAnswers: p.expectedAnswers,
      answerCheckSettings: p.answerCheckSettings ?? null,
      ownerUserId: p.ownerUserId,
      ownerSchoolId: p.ownerSchoolId ?? null,
      visibility: p.visibility,
      estimatedDurationSeconds: p.estimatedDurationSeconds ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      // A brand-new exercise is nobody's live material yet: its first document
      // goes straight into the live columns, and the draft starts empty.
      draft: null,
      instructions: null,
    });

    entity.addDomainEvent(
      new ExerciseCreatedEvent({
        exerciseId: entity.id,
        templateCode: p.templateCode,
        ownerUserId: p.ownerUserId,
        ownerSchoolId: p.ownerSchoolId ?? null,
        targetLanguage: p.targetLanguage,
        visibility: p.visibility,
      }),
    );

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: ExerciseProps): ExerciseEntity {
    return new ExerciseEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Updates mutable fields.
   * If content or expectedAnswers change, re-validates against the template schemas.
   * Immutable fields: exerciseTemplateId, targetLanguage, ownerUserId, ownerSchoolId.
   */
  update(
    changes: UpdateExerciseProps,
    templateEntity?: ExerciseTemplateEntity,
  ): Result<void, ExerciseDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_ALREADY_DELETED);
    }

    if (changes.visibility !== undefined) {
      const validVisibilities = getValidVisibilities(!!this.props.ownerSchoolId);
      if (!validVisibilities.includes(changes.visibility)) {
        return Result.fail(ExerciseDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
      }
    }

    if (
      (changes.content !== undefined || changes.expectedAnswers !== undefined) &&
      templateEntity
    ) {
      if (changes.content !== undefined) {
        const r = ExerciseContentValidatorService.validate(
          changes.content,
          templateEntity.contentSchema,
        );
        if (r.isFail) return Result.fail(r.error);
      }
      if (changes.expectedAnswers !== undefined) {
        const r = ExerciseContentValidatorService.validateAnswers(
          changes.expectedAnswers,
          templateEntity.answerSchema,
        );
        if (r.isFail) return Result.fail(r.error);
      }
    }

    const updatedFields: string[] = [];

    if (
      changes.difficultyLevel !== undefined &&
      changes.difficultyLevel !== this.props.difficultyLevel
    ) {
      this.props.difficultyLevel = changes.difficultyLevel;
      updatedFields.push('difficultyLevel');
    }

    // The document itself never lands on the live columns. Rewriting them is what
    // used to put a half-finished sentence in front of a student the moment their
    // teacher typed it; `promoteDraft` is now the only way anything gets there.
    const touchesDocument =
      changes.content !== undefined ||
      changes.expectedAnswers !== undefined ||
      'answerCheckSettings' in changes;

    if (touchesDocument) {
      const draft: ExerciseDraft = {
        content: changes.content ?? this.authoringContent,
        expectedAnswers: changes.expectedAnswers ?? this.authoringExpectedAnswers,
        answerCheckSettings:
          'answerCheckSettings' in changes
            ? (changes.answerCheckSettings ?? null)
            : this.authoringAnswerCheckSettings,
        updatedAt: new Date(),
      };

      // An edit walked back to what is already live leaves nothing to publish.
      // Without this, undoing a typo would leave the module claiming a pending
      // release forever, and the author with no way to clear it.
      this.props.draft = this.matchesLiveDocument(draft) ? null : draft;

      if (changes.content !== undefined) updatedFields.push('content');
      if (changes.expectedAnswers !== undefined) updatedFields.push('expectedAnswers');
      if ('answerCheckSettings' in changes) updatedFields.push('answerCheckSettings');
    }

    if (changes.visibility !== undefined && changes.visibility !== this.props.visibility) {
      this.props.visibility = changes.visibility;
      updatedFields.push('visibility');
    }
    if ('estimatedDurationSeconds' in changes) {
      this.props.estimatedDurationSeconds = changes.estimatedDurationSeconds ?? null;
      updatedFields.push('estimatedDurationSeconds');
    }

    if (updatedFields.length > 0) {
      // Only what actually reached the live row moves `updatedAt`: the draft
      // carries its own timestamp, and consumers of this one are asking when
      // students last saw something change.
      if (!touchesDocument) this.props.updatedAt = new Date();
      this.addDomainEvent(
        new ExerciseUpdatedEvent({
          exerciseId: this.id,
          updatedFields,
          released: !touchesDocument,
        }),
      );
    }

    return Result.ok();
  }

  /**
   * Releases the unreleased edit. Called when a container placing this exercise
   * is published — never on save, which is the entire point of the draft.
   *
   * Returns false when there was nothing waiting, so a publish can report how
   * much it actually released.
   */
  promoteDraft(): boolean {
    const draft = this.props.draft;
    if (draft === null) return false;

    this.props.content = draft.content;
    this.props.expectedAnswers = draft.expectedAnswers;
    this.props.answerCheckSettings = draft.answerCheckSettings;
    this.props.draft = null;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new ExerciseUpdatedEvent({
        exerciseId: this.id,
        updatedFields: ['content', 'expectedAnswers', 'answerCheckSettings'],
        released: true,
      }),
    );

    return true;
  }

  /** Throws the unreleased edit away, leaving students' version untouched. */
  discardDraft(): void {
    this.props.draft = null;
  }

  /** Deep equality against the live document — plain JSON on both sides. */
  private matchesLiveDocument(draft: ExerciseDraft): boolean {
    return (
      JSON.stringify(draft.content) === JSON.stringify(this.props.content) &&
      JSON.stringify(draft.expectedAnswers) === JSON.stringify(this.props.expectedAnswers) &&
      JSON.stringify(draft.answerCheckSettings) === JSON.stringify(this.props.answerCheckSettings)
    );
  }

  softDelete(): Result<void, ExerciseDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_ALREADY_DELETED);
    }

    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new ExerciseDeletedEvent({ exerciseId: this.id, ownerUserId: this.props.ownerUserId }),
    );

    return Result.ok();
  }
}
