import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RevokeEntitlementHandler } from './revoke-entitlement.handler.js';
import { RevokeEntitlementCommand } from './revoke-entitlement.command.js';
import { ContentEntitlementEntity } from '../../../domain/entities/content-entitlement.entity.js';
import { EntitlementType } from '../../../domain/value-objects/entitlement-type.vo.js';
import { Visibility } from '../../../../../modules/container/domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../../../modules/container/domain/value-objects/access-tier.vo.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import type { IContentEntitlementRepository } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import type { AccessibleEntity } from '../../../../../shared/access-control/domain/types/accessible-entity.js';

const GRANTOR_ID = 'grantor-1';
const OTHER_ID = 'other-1';
const CONTAINER_ID = 'container-1';
const ENTITLEMENT_ID = 'ent-1';

function makeEntitlement(overrides?: {
  grantedByUserId?: string;
  revokedAt?: Date | null;
}): ContentEntitlementEntity {
  const e = ContentEntitlementEntity.create(
    {
      userId: 'student-1',
      containerId: CONTAINER_ID,
      entitlementType: EntitlementType.MANUAL,
      grantedByUserId: overrides?.grantedByUserId ?? GRANTOR_ID,
    },
    ENTITLEMENT_ID,
  );
  if (overrides?.revokedAt !== undefined && overrides.revokedAt !== null) {
    // simulate already-revoked by calling revoke() once
    e.revoke();
  }
  return e;
}

function makeEntity(): AccessibleEntity {
  return {
    id: CONTAINER_ID,
    entityType: TaggableEntityType.CONTAINER,
    ownerUserId: GRANTOR_ID,
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    deletedAt: null,
    accessTier: AccessTier.PUBLIC_PAID,
  };
}

function makeHandler(
  options: {
    entitlement?: ContentEntitlementEntity | null;
    entity?: AccessibleEntity | null;
    canAccess?: boolean;
  } = {},
) {
  const { entitlement = makeEntitlement(), entity = makeEntity(), canAccess = true } = options;

  const entitlementRepo: IContentEntitlementRepository = {
    findById: jest.fn().mockResolvedValue(entitlement),
    findActiveByUser: jest.fn(),
    findActiveByContainer: jest.fn(),
    hasActiveEntitlement: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const registry = new EntityResolverRegistry();
  if (entity !== null) {
    registry.register(TaggableEntityType.CONTAINER, jest.fn().mockResolvedValue(entity));
  }

  const checker = {
    canAccess: jest
      .fn()
      .mockResolvedValue({ allowed: canAccess, reason: canAccess ? 'owner' : 'private' }),
  } as unknown as VisibilityCheckerService;

  return new RevokeEntitlementHandler(entitlementRepo, registry, checker);
}

describe('RevokeEntitlementHandler', () => {
  it('allows the original grantor to revoke their own entitlement', async () => {
    const handler = makeHandler();
    const command = new RevokeEntitlementCommand(ENTITLEMENT_ID, GRANTOR_ID, false);
    await expect(handler.execute(command)).resolves.toBeUndefined();
  });

  it('allows platform admin to revoke any entitlement without access check', async () => {
    const entitlement = makeEntitlement({ grantedByUserId: 'someone-else' });
    const handler = makeHandler({ entitlement });
    const command = new RevokeEntitlementCommand(ENTITLEMENT_ID, 'admin-user', true);
    await expect(handler.execute(command)).resolves.toBeUndefined();
  });

  it('allows non-grantor with edit access on the container to revoke', async () => {
    const entitlement = makeEntitlement({ grantedByUserId: 'original-grantor' });
    const handler = makeHandler({ entitlement, canAccess: true });
    const command = new RevokeEntitlementCommand(ENTITLEMENT_ID, OTHER_ID, false);
    await expect(handler.execute(command)).resolves.toBeUndefined();
  });

  it('throws NotFoundException when entitlement does not exist', async () => {
    const handler = makeHandler({ entitlement: null });
    const command = new RevokeEntitlementCommand(ENTITLEMENT_ID, GRANTOR_ID, false);
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when non-grantor lacks edit access', async () => {
    const entitlement = makeEntitlement({ grantedByUserId: 'original-grantor' });
    const handler = makeHandler({ entitlement, canAccess: false });
    const command = new RevokeEntitlementCommand(ENTITLEMENT_ID, OTHER_ID, false);
    await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when entitlement is already revoked', async () => {
    const entitlement = makeEntitlement({ revokedAt: new Date() });
    const handler = makeHandler({ entitlement });
    const command = new RevokeEntitlementCommand(ENTITLEMENT_ID, GRANTOR_ID, false);
    await expect(handler.execute(command)).rejects.toThrow(BadRequestException);
  });
});
