import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import {
  DifficultyLevel,
  compareLevels,
} from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { VariantStatus } from '../value-objects/variant-status.vo.js';
import { LessonDomainError } from '../exceptions/lesson-domain.exceptions.js';

interface LessonContentVariantProps {
  lessonId: string;
  explanationLanguage: string;
  minLevel: DifficultyLevel;
  maxLevel: DifficultyLevel;
  displayTitle: string;
  displayDescription: string | null;
  bodyMarkdown: string;
  estimatedReadingMinutes: number | null;
  status: VariantStatus;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  lastEditedByUserId: string;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

export interface CreateVariantProps {
  lessonId: string;
  explanationLanguage: string;
  minLevel: DifficultyLevel;
  maxLevel: DifficultyLevel;
  displayTitle: string;
  displayDescription?: string;
  bodyMarkdown: string;
  estimatedReadingMinutes?: number;
  createdByUserId: string;
}

export interface UpdateVariantProps {
  displayTitle?: string;
  displayDescription?: string | null;
  bodyMarkdown?: string;
  estimatedReadingMinutes?: number | null;
}

export class LessonContentVariantEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: LessonContentVariantProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get lessonId(): string {
    return this.props.lessonId;
  }
  get explanationLanguage(): string {
    return this.props.explanationLanguage;
  }
  get minLevel(): DifficultyLevel {
    return this.props.minLevel;
  }
  get maxLevel(): DifficultyLevel {
    return this.props.maxLevel;
  }
  get displayTitle(): string {
    return this.props.displayTitle;
  }
  get displayDescription(): string | null {
    return this.props.displayDescription;
  }
  get bodyMarkdown(): string {
    return this.props.bodyMarkdown;
  }
  get estimatedReadingMinutes(): number | null {
    return this.props.estimatedReadingMinutes;
  }
  get status(): VariantStatus {
    return this.props.status;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get lastEditedByUserId(): string {
    return this.props.lastEditedByUserId;
  }
  get publishedAt(): Date | null {
    return this.props.publishedAt;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreateVariantProps,
    id?: string,
  ): Result<LessonContentVariantEntity, LessonDomainError> {
    // compareLevels(a, b) > 0 means a > b, i.e. minLevel is greater than maxLevel.
    if (compareLevels(p.minLevel, p.maxLevel) > 0) {
      return Result.fail(LessonDomainError.INVALID_LEVEL_RANGE);
    }

    if (!p.bodyMarkdown?.trim()) {
      return Result.fail(LessonDomainError.EMPTY_BODY_MARKDOWN);
    }

    const now = new Date();
    const entity = new LessonContentVariantEntity(id ?? randomUUID(), {
      lessonId: p.lessonId,
      explanationLanguage: p.explanationLanguage,
      minLevel: p.minLevel,
      maxLevel: p.maxLevel,
      displayTitle: p.displayTitle,
      displayDescription: p.displayDescription ?? null,
      bodyMarkdown: p.bodyMarkdown,
      estimatedReadingMinutes: p.estimatedReadingMinutes ?? null,
      status: VariantStatus.DRAFT,
      createdAt: now,
      updatedAt: now,
      createdByUserId: p.createdByUserId,
      lastEditedByUserId: p.createdByUserId,
      publishedAt: null,
      deletedAt: null,
    });

    return Result.ok(entity);
  }

  // Reconstitute from persistence — no side effects.
  static reconstitute(id: string, props: LessonContentVariantProps): LessonContentVariantEntity {
    return new LessonContentVariantEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Updates mutable display fields. Intentionally allowed even on PUBLISHED variants
   * (silent updates for typo fixes, clarifications, etc.).
   * Immutable fields: lessonId, explanationLanguage, minLevel, maxLevel, createdByUserId.
   */
  update(changes: UpdateVariantProps, editorUserId: string): Result<void, LessonDomainError> {
    if (changes.bodyMarkdown !== undefined && !changes.bodyMarkdown.trim()) {
      return Result.fail(LessonDomainError.EMPTY_BODY_MARKDOWN);
    }

    if (changes.displayTitle !== undefined) {
      this.props.displayTitle = changes.displayTitle;
    }
    if ('displayDescription' in changes) {
      this.props.displayDescription = changes.displayDescription ?? null;
    }
    if (changes.bodyMarkdown !== undefined) {
      this.props.bodyMarkdown = changes.bodyMarkdown;
    }
    if ('estimatedReadingMinutes' in changes) {
      this.props.estimatedReadingMinutes = changes.estimatedReadingMinutes ?? null;
    }

    this.props.lastEditedByUserId = editorUserId;
    this.props.updatedAt = new Date();

    return Result.ok();
  }

  /**
   * Transitions DRAFT → PUBLISHED. Returns VARIANT_ALREADY_PUBLISHED if already published.
   * Domain events (LessonVariantPublishedEvent) are raised by the command handler
   * and published via IEventPublisher directly, following the same pattern as
   * container's publish-version handler.
   */
  publish(): Result<void, LessonDomainError> {
    if (this.props.status === VariantStatus.PUBLISHED) {
      return Result.fail(LessonDomainError.VARIANT_ALREADY_PUBLISHED);
    }

    this.props.status = VariantStatus.PUBLISHED;
    this.props.publishedAt = new Date();
    this.props.updatedAt = new Date();

    return Result.ok();
  }
}
