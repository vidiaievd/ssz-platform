import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { TagCategory } from '../value-objects/tag-category.vo.js';
import { TagScope } from '../value-objects/tag-scope.vo.js';
import { TagDomainError } from '../exceptions/tag-domain.exceptions.js';
import { TagCreatedEvent } from '../events/tag-created.event.js';
import { TagUpdatedEvent } from '../events/tag-updated.event.js';
import { TagDeletedEvent } from '../events/tag-deleted.event.js';

interface TagProps {
  slug: string;
  name: string;
  category: TagCategory;
  scope: TagScope;
  ownerSchoolId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  createdByUserId: string;
}

export interface CreateTagProps {
  slug: string;
  name: string;
  category: TagCategory;
  scope: TagScope;
  ownerSchoolId?: string;
  createdByUserId: string;
}

export class TagEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: TagProps,
  ) {
    super(id);
  }

  get slug(): string {
    return this.props.slug;
  }
  get name(): string {
    return this.props.name;
  }
  get category(): TagCategory {
    return this.props.category;
  }
  get scope(): TagScope {
    return this.props.scope;
  }
  get ownerSchoolId(): string | null {
    return this.props.ownerSchoolId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }

  static create(p: CreateTagProps, id?: string): Result<TagEntity, TagDomainError> {
    if (p.scope === TagScope.GLOBAL && p.ownerSchoolId) {
      return Result.fail(TagDomainError.GLOBAL_TAG_REQUIRES_NO_SCHOOL);
    }
    if (p.scope === TagScope.SCHOOL && !p.ownerSchoolId) {
      return Result.fail(TagDomainError.SCHOOL_TAG_REQUIRES_SCHOOL);
    }

    const now = new Date();
    const entity = new TagEntity(id ?? randomUUID(), {
      slug: p.slug,
      name: p.name,
      category: p.category,
      scope: p.scope,
      ownerSchoolId: p.ownerSchoolId ?? null,
      createdAt: now,
      deletedAt: null,
      createdByUserId: p.createdByUserId,
    });

    entity.addDomainEvent(
      new TagCreatedEvent({
        tagId: entity.id,
        slug: p.slug,
        name: p.name,
        category: p.category,
        scope: p.scope,
        ownerSchoolId: p.ownerSchoolId ?? null,
        createdByUserId: p.createdByUserId,
      }),
    );

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: TagProps): TagEntity {
    return new TagEntity(id, props);
  }

  update(changes: { name?: string; category?: TagCategory }): Result<void, TagDomainError> {
    if (this.props.deletedAt !== null) return Result.fail(TagDomainError.TAG_ALREADY_DELETED);

    const updated: string[] = [];
    if (changes.name !== undefined && changes.name !== this.props.name) {
      this.props.name = changes.name;
      updated.push('name');
    }
    if (changes.category !== undefined && changes.category !== this.props.category) {
      this.props.category = changes.category;
      updated.push('category');
    }
    if (updated.length > 0) {
      this.addDomainEvent(new TagUpdatedEvent({ tagId: this.id, updatedFields: updated }));
    }
    return Result.ok();
  }

  softDelete(): Result<void, TagDomainError> {
    if (this.props.deletedAt !== null) return Result.fail(TagDomainError.TAG_ALREADY_DELETED);
    this.props.deletedAt = new Date();
    this.addDomainEvent(new TagDeletedEvent({ tagId: this.id }));
    return Result.ok();
  }
}
