import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { RevokeContentShareCommand } from './revoke-content-share.command.js';
import { CONTENT_SHARE_REPOSITORY } from '../../../domain/repositories/content-share.repository.interface.js';
import type { IContentShareRepository } from '../../../domain/repositories/content-share.repository.interface.js';
import { ContentShareDomainError } from '../../../domain/exceptions/content-share-domain.exceptions.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';

@CommandHandler(RevokeContentShareCommand)
export class RevokeContentShareHandler implements ICommandHandler<RevokeContentShareCommand, void> {
  constructor(
    @Inject(CONTENT_SHARE_REPOSITORY) private readonly shareRepo: IContentShareRepository,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
  ) {}

  async execute(command: RevokeContentShareCommand): Promise<void> {
    const share = await this.shareRepo.findById(command.shareId);
    if (!share) throw new NotFoundException('Share not found');

    const isOriginalSharer = share.sharedByUserId === command.callerUserId;

    if (!isOriginalSharer && !command.isPlatformAdmin) {
      // Check if caller has edit access on the entity
      const entity = await this.registry.resolve(share.entityType, share.entityId);
      if (!entity) throw new NotFoundException('Entity not found');

      const decision = await this.checker.canAccess(
        { userId: command.callerUserId, isPlatformAdmin: command.isPlatformAdmin, roles: [] },
        entity,
        'edit',
      );
      if (!decision.allowed)
        throw new ForbiddenException('Insufficient access to revoke this share');
    }

    const result = share.revoke('manual');
    if (result.isFail) {
      if (result.error === ContentShareDomainError.SHARE_ALREADY_REVOKED) {
        throw new BadRequestException('Share is already revoked');
      }
      throw new BadRequestException('Cannot revoke share');
    }

    await this.shareRepo.save(share);
  }
}
