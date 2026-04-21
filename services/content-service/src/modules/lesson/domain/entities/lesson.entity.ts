import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import {
  Visibility,
  getValidVisibilities,
} from '../../../container/domain/value-objects/visibility.vo.js';
import { LessonDomainError } from '../exceptions/lesson-domain.exceptions.js';
import { LessonCreatedEvent } from '../events/lesson-created.event.js';
import { LessonUpdatedEvent } from '../events/lesson-updated.event.js';
import { LessonDeletedEvent } from '../events/lesson-deleted.event.js';

interface LessonProps {
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  slug: string | null;
  title: string;
  description: string | null;
  coverImageMediaId: string | null;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: Visibility;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateLessonProps {
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  title: string;
  description?: string;
  coverImageMediaId?: string;
  ownerUserId: string;
  ownerSchoolId?: string;
  visibility: Visibility;
}

export interface UpdateLessonProps {
  title?: string;
  description?: string | null;
  difficultyLevel?: DifficultyLevel;
  coverImageMediaId?: string | null;
  visibility?: Visibility;
}

export class LessonEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: LessonProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get targetLanguage(): string {
    return this.props.targetLanguage;
  }
  get difficultyLevel(): DifficultyLevel {
    return this.props.difficultyLevel;
  }
  get slug(): string | null {
    return this.props.slug;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
  }
  get coverImageMediaId(): string | null {
    return this.props.coverImageMediaId;
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
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(p: CreateLessonProps, id?: string): Result<LessonEntity, LessonDomainError> {
    const validVisibilities = getValidVisibilities(!!p.ownerSchoolId);
    if (!validVisibilities.includes(p.visibility)) {
      return Result.fail(LessonDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
    }

    const now = new Date();
    const entity = new LessonEntity(id ?? randomUUID(), {
      targetLanguage: p.targetLanguage,
      difficultyLevel: p.difficultyLevel,
      // Slug is always null on creation; assigned only when first variant is published
      // and lesson visibility is PUBLIC. See assignSlugIfNeeded().
      slug: null,
      title: p.title,
      description: p.description ?? null,
      coverImageMediaId: p.coverImageMediaId ?? null,
      ownerUserId: p.ownerUserId,
      ownerSchoolId: p.ownerSchoolId ?? null,
      visibility: p.visibility,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    entity.addDomainEvent(
      new LessonCreatedEvent({
        lessonId: entity.id,
        ownerUserId: p.ownerUserId,
        ownerSchoolId: p.ownerSchoolId ?? null,
        targetLanguage: p.targetLanguage,
        visibility: p.visibility,
      }),
    );

    return Result.ok(entity);
  }

  // Reconstitute from persistence — no domain events raised.
  static reconstitute(id: string, props: LessonProps): LessonEntity {
    return new LessonEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  update(changes: UpdateLessonProps): Result<void, LessonDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(LessonDomainError.LESSON_ALREADY_DELETED);
    }

    if (changes.visibility !== undefined) {
      const validVisibilities = getValidVisibilities(!!this.props.ownerSchoolId);
      if (!validVisibilities.includes(changes.visibility)) {
        return Result.fail(LessonDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
      }
    }

    const updatedFields: string[] = [];

    if (changes.title !== undefined && changes.title !== this.props.title) {
      this.props.title = changes.title;
      updatedFields.push('title');
    }
    if ('description' in changes && changes.description !== this.props.description) {
      this.props.description = changes.description ?? null;
      updatedFields.push('description');
    }
    if (
      changes.difficultyLevel !== undefined &&
      changes.difficultyLevel !== this.props.difficultyLevel
    ) {
      this.props.difficultyLevel = changes.difficultyLevel;
      updatedFields.push('difficultyLevel');
    }
    if (
      'coverImageMediaId' in changes &&
      changes.coverImageMediaId !== this.props.coverImageMediaId
    ) {
      this.props.coverImageMediaId = changes.coverImageMediaId ?? null;
      updatedFields.push('coverImageMediaId');
    }
    if (changes.visibility !== undefined && changes.visibility !== this.props.visibility) {
      this.props.visibility = changes.visibility;
      updatedFields.push('visibility');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new LessonUpdatedEvent({ lessonId: this.id, updatedFields }));
    }

    return Result.ok();
  }

  softDelete(): Result<void, LessonDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(LessonDomainError.LESSON_ALREADY_DELETED);
    }

    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new LessonDeletedEvent({
        lessonId: this.id,
        ownerUserId: this.props.ownerUserId,
      }),
    );

    return Result.ok();
  }

  /**
   * Assigns a generated slug to this lesson.
   * Called by PublishVariantHandler when the first variant is published and
   * visibility is PUBLIC. Slug is immutable after first assignment.
   */
  assignSlugIfNeeded(generated: string): void {
    if (this.props.slug === null && this.props.visibility === Visibility.PUBLIC) {
      this.props.slug = generated;
      this.props.updatedAt = new Date();
    }
    // Silently no-op if slug is already set or lesson is not public.
  }
}
