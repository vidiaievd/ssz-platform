import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import {
  Visibility,
  getValidVisibilities,
} from '../../../container/domain/value-objects/visibility.vo.js';
import { LessonKind } from '../value-objects/lesson-kind.vo.js';
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
  kind: LessonKind;
  // LIVE-kind stub fields only (decision 2) — minimal reference to an
  // externally-scheduled session. No attendance/recording/approval.
  liveStartsAt: Date | null;
  liveDurationMinutes: number | null;
  liveJoinUrl: string | null;
  liveCapacity: number | null;
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
  kind?: LessonKind;
  liveStartsAt?: Date;
  liveDurationMinutes?: number;
  liveJoinUrl?: string;
  liveCapacity?: number;
}

export interface UpdateLessonProps {
  title?: string;
  description?: string | null;
  difficultyLevel?: DifficultyLevel;
  coverImageMediaId?: string | null;
  visibility?: Visibility;
  liveStartsAt?: Date | null;
  liveDurationMinutes?: number | null;
  liveJoinUrl?: string | null;
  liveCapacity?: number | null;
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
  get kind(): LessonKind {
    return this.props.kind;
  }
  get liveStartsAt(): Date | null {
    return this.props.liveStartsAt;
  }
  get liveDurationMinutes(): number | null {
    return this.props.liveDurationMinutes;
  }
  get liveJoinUrl(): string | null {
    return this.props.liveJoinUrl;
  }
  get liveCapacity(): number | null {
    return this.props.liveCapacity;
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

    const kind = p.kind ?? LessonKind.TEXT;
    const hasLiveFields =
      p.liveStartsAt !== undefined ||
      p.liveDurationMinutes !== undefined ||
      p.liveJoinUrl !== undefined ||
      p.liveCapacity !== undefined;
    if (hasLiveFields && kind !== LessonKind.LIVE) {
      return Result.fail(LessonDomainError.LIVE_FIELDS_REQUIRE_LIVE_KIND);
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
      kind,
      liveStartsAt: p.liveStartsAt ?? null,
      liveDurationMinutes: p.liveDurationMinutes ?? null,
      liveJoinUrl: p.liveJoinUrl ?? null,
      liveCapacity: p.liveCapacity ?? null,
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

    const hasLiveFieldChange =
      changes.liveStartsAt !== undefined ||
      changes.liveDurationMinutes !== undefined ||
      changes.liveJoinUrl !== undefined ||
      changes.liveCapacity !== undefined;
    if (hasLiveFieldChange && this.props.kind !== LessonKind.LIVE) {
      return Result.fail(LessonDomainError.LIVE_FIELDS_REQUIRE_LIVE_KIND);
    }

    const updatedFields: string[] = [];

    if (changes.title !== undefined && changes.title !== this.props.title) {
      this.props.title = changes.title;
      updatedFields.push('title');
    }
    if (changes.description !== undefined && changes.description !== this.props.description) {
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
      changes.coverImageMediaId !== undefined &&
      changes.coverImageMediaId !== this.props.coverImageMediaId
    ) {
      this.props.coverImageMediaId = changes.coverImageMediaId ?? null;
      updatedFields.push('coverImageMediaId');
    }
    if (changes.visibility !== undefined && changes.visibility !== this.props.visibility) {
      this.props.visibility = changes.visibility;
      updatedFields.push('visibility');
    }
    if (changes.liveStartsAt !== undefined) {
      this.props.liveStartsAt = changes.liveStartsAt;
      updatedFields.push('liveStartsAt');
    }
    if (changes.liveDurationMinutes !== undefined) {
      this.props.liveDurationMinutes = changes.liveDurationMinutes;
      updatedFields.push('liveDurationMinutes');
    }
    if (changes.liveJoinUrl !== undefined) {
      this.props.liveJoinUrl = changes.liveJoinUrl;
      updatedFields.push('liveJoinUrl');
    }
    if (changes.liveCapacity !== undefined) {
      this.props.liveCapacity = changes.liveCapacity;
      updatedFields.push('liveCapacity');
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
