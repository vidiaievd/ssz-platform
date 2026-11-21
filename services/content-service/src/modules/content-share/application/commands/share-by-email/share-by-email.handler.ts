import { BadRequestException, ForbiddenException, Inject, NotFoundException } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ShareByEmailCommand } from './share-by-email.command.js';
import { CreateContentShareCommand } from '../create-content-share/create-content-share.command.js';
import type { ContentShareEntity } from '../../../domain/entities/content-share.entity.js';
import { USER_EMAIL_LOOKUP, type IUserEmailLookup } from '../../ports/user-email-lookup.port.js';
import { LOOKUP_RATE_LIMITER, type ILookupRateLimiter } from '../../ports/lookup-rate-limiter.port.js';
import {
  LookupRateLimitedException,
  ShareRecipientNotFoundException,
} from '../../../domain/exceptions/share-by-email.exceptions.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { Visibility } from '../../../../../modules/container/domain/value-objects/visibility.vo.js';

/**
 * Sharing by e-mail without a public address lookup (plan 90, session 16 remark 4, variant A).
 * The address is resolved only for someone who may already share this material — edit right on
 * it, visibility `shared` — and each resolution counts against that person's lookup limit. The
 * answer never says more than the share itself: a missing account is `USER_NOT_FOUND`.
 */
@CommandHandler(ShareByEmailCommand)
export class ShareByEmailHandler implements ICommandHandler<ShareByEmailCommand, ContentShareEntity> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
    @Inject(USER_EMAIL_LOOKUP) private readonly lookup: IUserEmailLookup,
    @Inject(LOOKUP_RATE_LIMITER) private readonly rateLimiter: ILookupRateLimiter,
  ) {}

  async execute(command: ShareByEmailCommand): Promise<ContentShareEntity> {
    const email = command.email.trim();
    if (!email) throw new BadRequestException('Email is required');

    // The same checks the share itself makes, before anything about the address is asked.
    const entity = await this.registry.resolve(command.entityType, command.entityId);
    if (!entity) throw new NotFoundException('Entity not found');
    const decision = await this.checker.canAccess(
      { userId: command.callerUserId, isPlatformAdmin: command.isPlatformAdmin, roles: [] },
      entity,
      'edit',
    );
    if (!decision.allowed) throw new ForbiddenException('Insufficient access to share this entity');
    if (entity.visibility !== Visibility.SHARED) {
      throw new BadRequestException("Entity must have visibility='shared' to be shared with users");
    }

    const quota = await this.rateLimiter.consume(command.callerUserId);
    if (!quota.allowed) throw new LookupRateLimitedException(quota.retryAfterMs);

    const recipientId = await this.lookup.findUserIdByEmail(email);
    if (!recipientId) throw new ShareRecipientNotFoundException();

    return this.commandBus.execute<CreateContentShareCommand, ContentShareEntity>(
      new CreateContentShareCommand(
        command.callerUserId,
        command.isPlatformAdmin,
        command.entityType,
        command.entityId,
        recipientId,
        command.permission,
        command.expiresAt,
        command.note,
      ),
    );
  }
}
