import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { RevokeEntitlementCommand } from './revoke-entitlement.command.js';
import { CONTENT_ENTITLEMENT_REPOSITORY } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import type { IContentEntitlementRepository } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import { EntitlementDomainError } from '../../../domain/exceptions/entitlement-domain.exceptions.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

@CommandHandler(RevokeEntitlementCommand)
export class RevokeEntitlementHandler implements ICommandHandler<RevokeEntitlementCommand, void> {
  constructor(
    @Inject(CONTENT_ENTITLEMENT_REPOSITORY)
    private readonly entitlementRepo: IContentEntitlementRepository,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
  ) {}

  async execute(command: RevokeEntitlementCommand): Promise<void> {
    const entitlement = await this.entitlementRepo.findById(command.entitlementId);
    if (!entitlement) throw new NotFoundException('Entitlement not found');

    const isGranter = entitlement.grantedByUserId === command.callerUserId;

    if (!isGranter && !command.isPlatformAdmin) {
      const entity = await this.registry.resolve(
        TaggableEntityType.CONTAINER,
        entitlement.containerId,
      );
      if (!entity) throw new NotFoundException('Container not found');

      const decision = await this.checker.canAccess(
        { userId: command.callerUserId, isPlatformAdmin: command.isPlatformAdmin, roles: [] },
        entity,
        'edit',
      );
      if (!decision.allowed)
        throw new ForbiddenException('Insufficient access to revoke this entitlement');
    }

    const result = entitlement.revoke();
    if (result.isFail) {
      if (result.error === EntitlementDomainError.ENTITLEMENT_ALREADY_REVOKED) {
        throw new BadRequestException('Entitlement is already revoked');
      }
      throw new BadRequestException('Cannot revoke entitlement');
    }

    await this.entitlementRepo.save(entitlement);
  }
}
