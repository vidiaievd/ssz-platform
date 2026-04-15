import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ContainerType } from '../value-objects/container-type.vo.js';
import { DifficultyLevel } from '../value-objects/difficulty-level.vo.js';
import { Visibility, getValidVisibilities } from '../value-objects/visibility.vo.js';
import { AccessTier } from '../value-objects/access-tier.vo.js';
import { ContainerDomainError } from '../exceptions/container-domain.exceptions.js';
import { ContainerCreatedEvent } from '../events/container-created.event.js';
import { ContainerUpdatedEvent } from '../events/container-updated.event.js';
import { ContainerDeletedEvent } from '../events/container-deleted.event.js';

interface ContainerProps {
  slug: string | null;
  containerType: ContainerType;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  title: string;
  description: string | null;
  coverImageMediaId: string | null;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: Visibility;
  accessTier: AccessTier;
  currentPublishedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateContainerProps {
  containerType: ContainerType;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  title: string;
  description?: string;
  coverImageMediaId?: string;
  ownerUserId: string;
  ownerSchoolId?: string;
  visibility: Visibility;
  accessTier: AccessTier;
}

export interface UpdateContainerProps {
  title?: string;
  description?: string | null;
  difficultyLevel?: DifficultyLevel;
  coverImageMediaId?: string | null;
  visibility?: Visibility;
  accessTier?: AccessTier;
}

export class ContainerEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: ContainerProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get slug(): string | null {
    return this.props.slug;
  }
  get containerType(): ContainerType {
    return this.props.containerType;
  }
  get targetLanguage(): string {
    return this.props.targetLanguage;
  }
  get difficultyLevel(): DifficultyLevel {
    return this.props.difficultyLevel;
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
  get accessTier(): AccessTier {
    return this.props.accessTier;
  }
  get currentPublishedVersionId(): string | null {
    return this.props.currentPublishedVersionId;
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
    p: CreateContainerProps,
    id?: string,
  ): Result<ContainerEntity, ContainerDomainError> {
    const validVisibilities = getValidVisibilities(!!p.ownerSchoolId);
    if (!validVisibilities.includes(p.visibility)) {
      return Result.fail(ContainerDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
    }

    const now = new Date();
    const entity = new ContainerEntity(id ?? randomUUID(), {
      slug: null,
      containerType: p.containerType,
      targetLanguage: p.targetLanguage,
      difficultyLevel: p.difficultyLevel,
      title: p.title,
      description: p.description ?? null,
      coverImageMediaId: p.coverImageMediaId ?? null,
      ownerUserId: p.ownerUserId,
      ownerSchoolId: p.ownerSchoolId ?? null,
      visibility: p.visibility,
      accessTier: p.accessTier,
      currentPublishedVersionId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    entity.addDomainEvent(
      new ContainerCreatedEvent({
        containerId: entity.id,
        containerType: p.containerType,
        ownerUserId: p.ownerUserId,
        ownerSchoolId: p.ownerSchoolId ?? null,
        visibility: p.visibility,
        targetLanguage: p.targetLanguage,
      }),
    );

    return Result.ok(entity);
  }

  // Reconstitute from persistence — no domain events raised.
  static reconstitute(id: string, props: ContainerProps): ContainerEntity {
    return new ContainerEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  update(changes: UpdateContainerProps): Result<void, ContainerDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(ContainerDomainError.CONTAINER_ALREADY_DELETED);
    }

    if (changes.visibility !== undefined) {
      const validVisibilities = getValidVisibilities(!!this.props.ownerSchoolId);
      if (!validVisibilities.includes(changes.visibility)) {
        return Result.fail(ContainerDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE);
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
    if (changes.accessTier !== undefined && changes.accessTier !== this.props.accessTier) {
      this.props.accessTier = changes.accessTier;
      updatedFields.push('accessTier');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new ContainerUpdatedEvent({ containerId: this.id, updatedFields }));
    }

    return Result.ok();
  }

  softDelete(): Result<void, ContainerDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(ContainerDomainError.CONTAINER_ALREADY_DELETED);
    }

    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new ContainerDeletedEvent({
        containerId: this.id,
        ownerUserId: this.props.ownerUserId,
      }),
    );

    return Result.ok();
  }

  setSlug(slug: string): void {
    if (this.props.slug === null) {
      this.props.slug = slug;
      this.props.updatedAt = new Date();
    }
    // Slug is immutable after first assignment — silently ignore if already set.
  }

  setCurrentPublishedVersionId(versionId: string): void {
    this.props.currentPublishedVersionId = versionId;
    this.props.updatedAt = new Date();
  }
}
