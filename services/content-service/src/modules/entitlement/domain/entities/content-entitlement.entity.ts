import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { EntitlementType } from '../value-objects/entitlement-type.vo.js';
import { EntitlementDomainError } from '../exceptions/entitlement-domain.exceptions.js';
import { EntitlementGrantedEvent } from '../events/entitlement-granted.event.js';
import { EntitlementRevokedEvent } from '../events/entitlement-revoked.event.js';

interface ContentEntitlementProps {
  userId: string;
  containerId: string;
  entitlementType: EntitlementType;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  grantedByUserId: string | null;
  sourceReference: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CreateEntitlementProps {
  userId: string;
  containerId: string;
  entitlementType: EntitlementType;
  expiresAt?: Date;
  grantedByUserId?: string;
  sourceReference?: string;
  metadata?: Record<string, unknown>;
}

export class ContentEntitlementEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: ContentEntitlementProps,
  ) {
    super(id);
  }

  get userId(): string {
    return this.props.userId;
  }
  get containerId(): string {
    return this.props.containerId;
  }
  get entitlementType(): EntitlementType {
    return this.props.entitlementType;
  }
  get grantedAt(): Date {
    return this.props.grantedAt;
  }
  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }
  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }
  get grantedByUserId(): string | null {
    return this.props.grantedByUserId;
  }
  get sourceReference(): string | null {
    return this.props.sourceReference;
  }
  get metadata(): Record<string, unknown> | null {
    return this.props.metadata;
  }

  isActive(now: Date): boolean {
    if (this.props.revokedAt !== null) return false;
    if (this.props.expiresAt !== null && this.props.expiresAt <= now) return false;
    return true;
    // TODO: consider cron if downstream services need pre-emptive revocation events
  }

  static create(p: CreateEntitlementProps, id?: string): ContentEntitlementEntity {
    const now = new Date();
    const entity = new ContentEntitlementEntity(id ?? randomUUID(), {
      userId: p.userId,
      containerId: p.containerId,
      entitlementType: p.entitlementType,
      grantedAt: now,
      expiresAt: p.expiresAt ?? null,
      revokedAt: null,
      grantedByUserId: p.grantedByUserId ?? null,
      sourceReference: p.sourceReference ?? null,
      metadata: p.metadata ?? null,
    });

    entity.addDomainEvent(
      new EntitlementGrantedEvent({
        entitlementId: entity.id,
        userId: p.userId,
        containerId: p.containerId,
        entitlementType: p.entitlementType,
        grantedByUserId: p.grantedByUserId ?? null,
      }),
    );

    return entity;
  }

  static reconstitute(id: string, props: ContentEntitlementProps): ContentEntitlementEntity {
    return new ContentEntitlementEntity(id, props);
  }

  revoke(): Result<void, EntitlementDomainError> {
    if (this.props.revokedAt !== null) {
      return Result.fail(EntitlementDomainError.ENTITLEMENT_ALREADY_REVOKED);
    }
    this.props.revokedAt = new Date();
    this.addDomainEvent(
      new EntitlementRevokedEvent({
        entitlementId: this.id,
        userId: this.props.userId,
        containerId: this.props.containerId,
      }),
    );
    return Result.ok();
  }
}
