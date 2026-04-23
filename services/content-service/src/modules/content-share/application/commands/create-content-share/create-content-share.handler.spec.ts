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

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreateContentShareHandler } from './create-content-share.handler.js';
import { CreateContentShareCommand } from './create-content-share.command.js';
import { Visibility } from '../../../../../modules/container/domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../../../modules/container/domain/value-objects/access-tier.vo.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { SharePermission } from '../../../domain/value-objects/share-permission.vo.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import type { IContentShareRepository } from '../../../domain/repositories/content-share.repository.interface.js';
import type { AccessibleEntity } from '../../../../../shared/access-control/domain/types/accessible-entity.js';

const CALLER_ID = 'caller-1';
const RECIPIENT_ID = 'recipient-1';
const ENTITY_ID = 'entity-1';

function makeEntity(overrides: Partial<AccessibleEntity> = {}): AccessibleEntity {
  return {
    id: ENTITY_ID,
    entityType: TaggableEntityType.CONTAINER,
    ownerUserId: CALLER_ID,
    ownerSchoolId: null,
    visibility: Visibility.SHARED,
    deletedAt: null,
    accessTier: AccessTier.PUBLIC_FREE,
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

  const shareRepo: IContentShareRepository = {
    findById: jest.fn(),
    findActiveByEntity: jest.fn(),
    findActiveBySharedWithUser: jest.fn(),
    findExpiredAndNotRevoked: jest.fn(),
    hasActiveShare: jest.fn(),
    save,
    saveMany: jest.fn(),
  };

  const registry = new EntityResolverRegistry();
  registry.register(TaggableEntityType.CONTAINER, jest.fn().mockResolvedValue(entity));

  const checker = {
    canAccess: jest
      .fn()
      .mockResolvedValue({ allowed: canAccess, reason: canAccess ? 'owner' : 'private' }),
  } as unknown as VisibilityCheckerService;

  return new CreateContentShareHandler(shareRepo, registry, checker);
}

describe('CreateContentShareHandler', () => {
  it('creates a share when caller owns the entity and it is SHARED visibility', async () => {
    const handler = makeHandler();
    const command = new CreateContentShareCommand(
      CALLER_ID,
      false,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      RECIPIENT_ID,
      SharePermission.READ,
      undefined,
      undefined,
    );
    const share = await handler.execute(command);
    expect(share.entityId).toBe(ENTITY_ID);
    expect(share.sharedWithUserId).toBe(RECIPIENT_ID);
  });

  it('throws BadRequestException when caller tries to share with themselves', async () => {
    const handler = makeHandler();
    const command = new CreateContentShareCommand(
      CALLER_ID,
      false,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      CALLER_ID,
      SharePermission.READ,
      undefined,
      undefined,
    );
    await expect(handler.execute(command)).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when entity does not exist', async () => {
    const handler = makeHandler({ entity: null });
    const command = new CreateContentShareCommand(
      CALLER_ID,
      false,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      RECIPIENT_ID,
      SharePermission.READ,
      undefined,
      undefined,
    );
    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when caller lacks edit access', async () => {
    const handler = makeHandler({ canAccess: false });
    const command = new CreateContentShareCommand(
      CALLER_ID,
      false,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      RECIPIENT_ID,
      SharePermission.READ,
      undefined,
      undefined,
    );
    await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when entity visibility is not SHARED', async () => {
    const entity = makeEntity({ visibility: Visibility.PUBLIC });
    const handler = makeHandler({ entity });
    const command = new CreateContentShareCommand(
      CALLER_ID,
      false,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      RECIPIENT_ID,
      SharePermission.READ,
      undefined,
      undefined,
    );
    await expect(handler.execute(command)).rejects.toThrow(BadRequestException);
  });

  it('stores expiresAt and note when provided', async () => {
    const save = jest.fn().mockImplementation((e) => Promise.resolve(e));
    const handler = makeHandler({ save });
    const expiresAt = new Date('2027-01-01');
    const command = new CreateContentShareCommand(
      CALLER_ID,
      false,
      TaggableEntityType.CONTAINER,
      ENTITY_ID,
      RECIPIENT_ID,
      SharePermission.READ,
      expiresAt,
      'For review',
    );
    const share = await handler.execute(command);
    expect(share.expiresAt).toEqual(expiresAt);
    expect(share.note).toBe('For review');
  });
});
