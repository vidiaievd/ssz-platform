import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Inject,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../../../../../generated/prisma/client.js';
import { GrantEntitlementCommand } from './grant-entitlement.command.js';
import { ContentEntitlementEntity } from '../../../domain/entities/content-entitlement.entity.js';
import { CONTENT_ENTITLEMENT_REPOSITORY } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import type { IContentEntitlementRepository } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

@CommandHandler(GrantEntitlementCommand)
export class GrantEntitlementHandler implements ICommandHandler<
  GrantEntitlementCommand,
  ContentEntitlementEntity
> {
  private readonly logger = new Logger(GrantEntitlementHandler.name);

  constructor(
    @Inject(CONTENT_ENTITLEMENT_REPOSITORY)
    private readonly entitlementRepo: IContentEntitlementRepository,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
  ) {}

  async execute(command: GrantEntitlementCommand): Promise<ContentEntitlementEntity> {
    const entity = await this.registry.resolve(TaggableEntityType.CONTAINER, command.containerId);
    if (!entity) throw new NotFoundException('Container not found');
    if (entity.deletedAt !== null) throw new NotFoundException('Container has been deleted');

    const decision = await this.checker.canAccess(
      { userId: command.callerUserId, isPlatformAdmin: command.isPlatformAdmin, roles: [] },
      entity,
      'edit',
    );
    if (!decision.allowed)
      throw new ForbiddenException('Insufficient access to grant entitlements');

    const entitlement = ContentEntitlementEntity.create({
      userId: command.targetUserId,
      containerId: command.containerId,
      entitlementType: command.entitlementType,
      expiresAt: command.expiresAt,
      grantedByUserId: command.callerUserId,
      sourceReference: command.sourceReference,
      metadata: command.metadata,
    });

    try {
      return await this.entitlementRepo.save(entitlement);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'Active entitlement already exists for this user and container',
        );
      }
      this.logger.error('Failed to save entitlement', err);
      throw err;
    }
  }
}
