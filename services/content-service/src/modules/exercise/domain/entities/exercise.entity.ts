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
    if (changes.content !== undefined) {
      this.props.content = changes.content;
      updatedFields.push('content');
    }
    if (changes.expectedAnswers !== undefined) {
      this.props.expectedAnswers = changes.expectedAnswers;
      updatedFields.push('expectedAnswers');
    }
    if ('answerCheckSettings' in changes) {
      this.props.answerCheckSettings = changes.answerCheckSettings ?? null;
      updatedFields.push('answerCheckSettings');
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
      this.props.updatedAt = new Date();
      this.addDomainEvent(new ExerciseUpdatedEvent({ exerciseId: this.id, updatedFields }));
    }

    return Result.ok();
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
