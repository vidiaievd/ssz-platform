import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import {
  Visibility,
  getValidVisibilities,
} from '../../../container/domain/value-objects/visibility.vo.js';
import { VocabularyDomainError } from '../exceptions/vocabulary-domain.exceptions.js';
import { VocabularyListCreatedEvent } from '../events/vocabulary-list-created.event.js';
import { VocabularyListUpdatedEvent } from '../events/vocabulary-list-updated.event.js';
import { VocabularyListDeletedEvent } from '../events/vocabulary-list-deleted.event.js';

interface VocabularyListProps {
  slug: string | null;
  title: string;
  description: string | null;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: Visibility;
  autoAddToSrs: boolean;
  coverImageMediaId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateVocabularyListProps {
  title: string;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  ownerUserId: string;
  ownerSchoolId?: string;
  visibility: Visibility;
  description?: string;
  coverImageMediaId?: string;
  autoAddToSrs?: boolean;
}

export interface UpdateVocabularyListProps {
  title?: string;
  description?: string | null;
  difficultyLevel?: DifficultyLevel;
  coverImageMediaId?: string | null;
  visibility?: Visibility;
  autoAddToSrs?: boolean;
}

export class VocabularyListEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: VocabularyListProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get slug(): string | null {
    return this.props.slug;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
  }
  get targetLanguage(): string {
    return this.props.targetLanguage;
  }
  get difficultyLevel(): DifficultyLevel {
    return this.props.difficultyLevel;
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
  get autoAddToSrs(): boolean {
    return this.props.autoAddToSrs;
  }
  get coverImageMediaId(): string | null {
    return this.props.coverImageMediaId;
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

  static create(
    p: CreateVocabularyListProps,
    id?: string,
  ): Result<VocabularyListEntity, VocabularyDomainError> {
    if (p.title.trim().length === 0) {
      return Result.fail(VocabularyDomainError.EMPTY_WORD); // reusing closest error; title validation
    }

    const validVisibilities = getValidVisibilities(!!p.ownerSchoolId);
    if (!validVisibilities.includes(p.visibility)) {
      return Result.fail(VocabularyDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
    }

    const now = new Date();
    const entity = new VocabularyListEntity(id ?? randomUUID(), {
      // Slug is assigned after creation by the handler (if visibility = PUBLIC).
      slug: null,
      title: p.title,
      description: p.description ?? null,
      targetLanguage: p.targetLanguage,
      difficultyLevel: p.difficultyLevel,
      ownerUserId: p.ownerUserId,
      ownerSchoolId: p.ownerSchoolId ?? null,
      visibility: p.visibility,
      autoAddToSrs: p.autoAddToSrs ?? true,
      coverImageMediaId: p.coverImageMediaId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    entity.addDomainEvent(
      new VocabularyListCreatedEvent({
        listId: entity.id,
        ownerUserId: p.ownerUserId,
        ownerSchoolId: p.ownerSchoolId ?? null,
        targetLanguage: p.targetLanguage,
        visibility: p.visibility,
        autoAddToSrs: p.autoAddToSrs ?? true,
      }),
    );

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: VocabularyListProps): VocabularyListEntity {
    return new VocabularyListEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  update(changes: UpdateVocabularyListProps): Result<void, VocabularyDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_ALREADY_DELETED);
    }

    if (changes.visibility !== undefined) {
      const validVisibilities = getValidVisibilities(!!this.props.ownerSchoolId);
      if (!validVisibilities.includes(changes.visibility)) {
        return Result.fail(VocabularyDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
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
    if (changes.autoAddToSrs !== undefined && changes.autoAddToSrs !== this.props.autoAddToSrs) {
      this.props.autoAddToSrs = changes.autoAddToSrs;
      updatedFields.push('autoAddToSrs');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new VocabularyListUpdatedEvent({ listId: this.id, updatedFields }));
    }

    return Result.ok();
  }

  softDelete(): Result<void, VocabularyDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(VocabularyDomainError.LIST_ALREADY_DELETED);
    }

    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new VocabularyListDeletedEvent({ listId: this.id, ownerUserId: this.props.ownerUserId }),
    );

    return Result.ok();
  }

  /**
   * Assigns a generated slug to this list.
   * Slug is generated at creation if visibility = PUBLIC, or at the moment
   * visibility transitions to PUBLIC. Immutable after first assignment.
   */
  assignSlug(slug: string): Result<void, VocabularyDomainError> {
    if (this.props.slug !== null) {
      return Result.fail(VocabularyDomainError.SLUG_ALREADY_ASSIGNED);
    }
    this.props.slug = slug;
    this.props.updatedAt = new Date();
    return Result.ok();
  }
}
