import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { SharePermission } from '../value-objects/share-permission.vo.js';
import { ContentShareDomainError } from '../exceptions/content-share-domain.exceptions.js';
import { ContentSharedEvent } from '../events/content-shared.event.js';
import { ContentShareRevokedEvent } from '../events/content-share-revoked.event.js';

interface ContentShareProps {
  entityType: TaggableEntityType;
  entityId: string;
  sharedWithUserId: string;
  sharedByUserId: string;
  permission: SharePermission;
  expiresAt: Date | null;
  revokedAt: Date | null;
  note: string | null;
  createdAt: Date;
}

export interface CreateContentShareProps {
  entityType: TaggableEntityType;
  entityId: string;
  sharedWithUserId: string;
  sharedByUserId: string;
  permission?: SharePermission;
  expiresAt?: Date;
  note?: string;
}

export class ContentShareEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: ContentShareProps,
  ) {
    super(id);
  }

  get entityType(): TaggableEntityType {
    return this.props.entityType;
  }
  get entityId(): string {
    return this.props.entityId;
  }
  get sharedWithUserId(): string {
    return this.props.sharedWithUserId;
  }
  get sharedByUserId(): string {
    return this.props.sharedByUserId;
  }
  get permission(): SharePermission {
    return this.props.permission;
  }
  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }
  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }
  get note(): string | null {
    return this.props.note;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  isActive(now: Date): boolean {
    if (this.props.revokedAt !== null) return false;
    if (this.props.expiresAt !== null && this.props.expiresAt <= now) return false;
    return true;
  }

  static create(
    p: CreateContentShareProps,
    id?: string,
  ): Result<ContentShareEntity, ContentShareDomainError> {
    if (p.sharedWithUserId === p.sharedByUserId) {
      return Result.fail(ContentShareDomainError.CANNOT_SHARE_WITH_SELF);
    }

    const now = new Date();
    const entity = new ContentShareEntity(id ?? randomUUID(), {
      entityType: p.entityType,
      entityId: p.entityId,
      sharedWithUserId: p.sharedWithUserId,
      sharedByUserId: p.sharedByUserId,
      permission: p.permission ?? SharePermission.READ,
      expiresAt: p.expiresAt ?? null,
      revokedAt: null,
      note: p.note ?? null,
      createdAt: now,
    });

    entity.addDomainEvent(
      new ContentSharedEvent({
        shareId: entity.id,
        entityType: p.entityType,
        entityId: p.entityId,
        sharedWithUserId: p.sharedWithUserId,
        sharedByUserId: p.sharedByUserId,
        permission: entity.props.permission,
      }),
    );

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: ContentShareProps): ContentShareEntity {
    return new ContentShareEntity(id, props);
  }

  revoke(reason: 'manual' | 'expired'): Result<void, ContentShareDomainError> {
    if (this.props.revokedAt !== null) {
      return Result.fail(ContentShareDomainError.SHARE_ALREADY_REVOKED);
    }
    this.props.revokedAt = new Date();
    this.addDomainEvent(
      new ContentShareRevokedEvent({
        shareId: this.id,
        entityType: this.props.entityType,
        entityId: this.props.entityId,
        sharedWithUserId: this.props.sharedWithUserId,
        reason,
      }),
    );
    return Result.ok();
  }
}
