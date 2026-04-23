jest.mock('../../../../../../generated/prisma/client.js', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, meta: { code: string }) {
        super(message);
        this.code = meta.code;
      }
    },
  },
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GrantEntitlementHandler } from './grant-entitlement.handler.js';
import { GrantEntitlementCommand } from './grant-entitlement.command.js';
import { EntitlementType } from '../../../domain/value-objects/entitlement-type.vo.js';
import { Visibility } from '../../../../../modules/container/domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../../../modules/container/domain/value-objects/access-tier.vo.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import type { IContentEntitlementRepository } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import type { AccessibleEntity } from '../../../../../shared/access-control/domain/types/accessible-entity.js';

const CALLER_ID = 'admin-1';
const TARGET_ID = 'student-1';
const CONTAINER_ID = 'container-1';

function makeEntity(overrides: Partial<AccessibleEntity> = {}): AccessibleEntity {
  return {
    id: CONTAINER_ID,
    entityType: TaggableEntityType.CONTAINER,
    ownerUserId: CALLER_ID,
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    deletedAt: null,
    accessTier: AccessTier.PUBLIC_PAID,
    ...overrides,
  };
}

function makeHandler(
  options: {
    entity?: AccessibleEntity | null;
    canAccess?: boolean;
    save?: jest.Mock;
  } = {},
) {
  const {
    entity = makeEntity(),
    canAccess = true,
    save = jest.fn().mockImplementation((e) => Promise.resolve(e)),
  } = options;

  const entitlementRepo: IContentEntitlementRepository = {
    findById: jest.fn(),
    findActiveByUser: jest.fn(),
    findActiveByContainer: jest.fn(),
    hasActiveEntitlement: jest.fn(),
    save,
  };

  const registry = new EntityResolverRegistry();
  registry.register(TaggableEntityType.CONTAINER, jest.fn().mockResolvedValue(entity));

  const checker = {
    canAccess: jest
      .fn()
      .mockResolvedValue({ allowed: canAccess, reason: canAccess ? 'owner' : 'private' }),
  } as unknown as VisibilityCheckerService;

  return new GrantEntitlementHandler(entitlementRepo, registry, checker);
}

describe('GrantEntitlementHandler', () => {
  it('grants an entitlement when caller has edit access to the container', async () => {
    const handler = makeHandler();
    const command = new GrantEntitlementCommand(
      CALLER_ID,
      false,
      CONTAINER_ID,
      TARGET_ID,
      EntitlementType.MANUAL,
      undefined,
      undefined,
      undefined,
    );
    const entitlement = await handler.execute(command);
    expect(entitlement.userId).toBe(TARGET_ID);
    expect(entitlement.containerId).toBe(CONTAINER_ID);
  });

  it('throws NotFoundException when container does not exist', async () => {
    const handler = makeHandler({ entity: null });
    const command = new GrantEntitlementCommand(
      CALLER_ID,
      false,
      CONTAINER_ID,
      TARGET_ID,
      EntitlementType.MANUAL,
      undefined,
      undefined,
      undefined,
    );
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when container is soft-deleted', async () => {
    const handler = makeHandler({ entity: makeEntity({ deletedAt: new Date() }) });
    const command = new GrantEntitlementCommand(
      CALLER_ID,
      false,
      CONTAINER_ID,
      TARGET_ID,
      EntitlementType.MANUAL,
      undefined,
      undefined,
      undefined,
    );
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when caller lacks edit access', async () => {
    const handler = makeHandler({ canAccess: false });
    const command = new GrantEntitlementCommand(
      'other-user',
      false,
      CONTAINER_ID,
      TARGET_ID,
      EntitlementType.MANUAL,
      undefined,
      undefined,
      undefined,
    );
    await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
  });

  it('persists expiresAt, sourceReference, and metadata when provided', async () => {
    const save = jest.fn().mockImplementation((e) => Promise.resolve(e));
    const handler = makeHandler({ save });
    const expiresAt = new Date('2027-06-01');
    const command = new GrantEntitlementCommand(
      CALLER_ID,
      false,
      CONTAINER_ID,
      TARGET_ID,
      EntitlementType.SUBSCRIPTION,
      expiresAt,
      'inv-123',
      { plan: 'basic' },
    );
    const entitlement = await handler.execute(command);
    expect(entitlement.expiresAt).toEqual(expiresAt);
    expect(entitlement.sourceReference).toBe('inv-123');
    expect(entitlement.metadata).toEqual({ plan: 'basic' });
  });

  it('platform admin can grant entitlement even without direct ownership', async () => {
    const entity = makeEntity({ ownerUserId: 'someone-else' });
    const checker = {
      canAccess: jest.fn().mockResolvedValue({ allowed: true, reason: 'platform_admin' }),
    } as unknown as VisibilityCheckerService;
    const entitlementRepo: IContentEntitlementRepository = {
      findById: jest.fn(),
      findActiveByUser: jest.fn(),
      findActiveByContainer: jest.fn(),
      hasActiveEntitlement: jest.fn(),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    const registry = new EntityResolverRegistry();
    registry.register(TaggableEntityType.CONTAINER, jest.fn().mockResolvedValue(entity));
    const handler = new GrantEntitlementHandler(entitlementRepo, registry, checker);
    const command = new GrantEntitlementCommand(
      'admin-user',
      true,
      CONTAINER_ID,
      TARGET_ID,
      EntitlementType.FREE_GRANTED,
      undefined,
      undefined,
      undefined,
    );
    const entitlement = await handler.execute(command);
    expect(entitlement.userId).toBe(TARGET_ID);
  });
});
