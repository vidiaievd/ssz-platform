import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ShareByEmailHandler } from './share-by-email.handler.js';
import { ShareByEmailCommand } from './share-by-email.command.js';
import { CreateContentShareCommand } from '../create-content-share/create-content-share.command.js';
import { Visibility } from '../../../../../modules/container/domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../../../modules/container/domain/value-objects/access-tier.vo.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { SharePermission } from '../../../domain/value-objects/share-permission.vo.js';
import {
  LookupRateLimitedException,
  ShareRecipientNotFoundException,
} from '../../../domain/exceptions/share-by-email.exceptions.js';
import type { AccessibleEntity } from '../../../../../shared/access-control/domain/types/accessible-entity.js';

const entity: AccessibleEntity = {
  id: 'entity-1',
  entityType: TaggableEntityType.CONTAINER,
  ownerUserId: 'caller-1',
  ownerSchoolId: null,
  visibility: Visibility.SHARED,
  deletedAt: null,
  accessTier: AccessTier.PUBLIC_FREE,
};

function make(opts: {
  entity?: AccessibleEntity | null;
  allowed?: boolean;
  quota?: { allowed: boolean; retryAfterMs: number };
  recipient?: string | null;
} = {}) {
  const commandBus = { execute: jest.fn().mockResolvedValue({ id: 'share-1' }) };
  const registry = { resolve: jest.fn().mockResolvedValue(opts.entity === undefined ? entity : opts.entity) };
  const checker = { canAccess: jest.fn().mockResolvedValue({ allowed: opts.allowed ?? true }) };
  const lookup = { findUserIdByEmail: jest.fn().mockResolvedValue(opts.recipient === undefined ? 'user-2' : opts.recipient) };
  const rateLimiter = { consume: jest.fn().mockResolvedValue(opts.quota ?? { allowed: true, retryAfterMs: 0 }) };
  const handler = new ShareByEmailHandler(commandBus as any, registry as any, checker as any, lookup, rateLimiter);
  return { handler, commandBus, lookup, rateLimiter };
}

const cmd = (email = ' colleague@example.com ') =>
  new ShareByEmailCommand('caller-1', false, TaggableEntityType.CONTAINER, 'entity-1', email, SharePermission.EDIT, undefined, undefined);

describe('ShareByEmailHandler', () => {
  it('resolves the address and creates the share for its owner', async () => {
    const { handler, commandBus, lookup, rateLimiter } = make();
    await expect(handler.execute(cmd())).resolves.toEqual({ id: 'share-1' });
    expect(rateLimiter.consume).toHaveBeenCalledWith('caller-1');
    expect(lookup.findUserIdByEmail).toHaveBeenCalledWith('colleague@example.com');
    const sent = commandBus.execute.mock.calls[0][0] as CreateContentShareCommand;
    expect(sent).toBeInstanceOf(CreateContentShareCommand);
    expect(sent.sharedWithUserId).toBe('user-2');
    expect(sent.permission).toBe(SharePermission.EDIT);
  });

  it('USER_NOT_FOUND for an address without an account', async () => {
    const { handler, commandBus } = make({ recipient: null });
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(ShareRecipientNotFoundException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('429 over the limit, without asking user-profile', async () => {
    const { handler, lookup } = make({ quota: { allowed: false, retryAfterMs: 4_500 } });
    const err = await handler.execute(cmd()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LookupRateLimitedException);
    expect((err as LookupRateLimitedException).getStatus()).toBe(429);
    expect((err as LookupRateLimitedException).getResponse()).toMatchObject({ code: 'LOOKUP_RATE_LIMITED', retryAfterSeconds: 5 });
    expect(lookup.findUserIdByEmail).not.toHaveBeenCalled();
  });

  it('no edit right → 403 before the address is counted or looked up', async () => {
    const { handler, lookup, rateLimiter } = make({ allowed: false });
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(ForbiddenException);
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(lookup.findUserIdByEmail).not.toHaveBeenCalled();
  });

  it('a material that is not `shared` → 400 before the lookup', async () => {
    const { handler, lookup } = make({ entity: { ...entity, visibility: Visibility.PRIVATE } });
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(BadRequestException);
    expect(lookup.findUserIdByEmail).not.toHaveBeenCalled();
  });

  it('unknown entity → 404, blank address → 400', async () => {
    await expect(make({ entity: null }).handler.execute(cmd())).rejects.toBeInstanceOf(NotFoundException);
    await expect(make().handler.execute(cmd('  '))).rejects.toBeInstanceOf(BadRequestException);
  });
});
