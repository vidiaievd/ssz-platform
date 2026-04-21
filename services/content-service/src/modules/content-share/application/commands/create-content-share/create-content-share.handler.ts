import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Inject,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../../../../../generated/prisma/client.js';
import { CreateContentShareCommand } from './create-content-share.command.js';
import { ContentShareEntity } from '../../../domain/entities/content-share.entity.js';
import { ContentShareDomainError } from '../../../domain/exceptions/content-share-domain.exceptions.js';
import { CONTENT_SHARE_REPOSITORY } from '../../../domain/repositories/content-share.repository.interface.js';
import type { IContentShareRepository } from '../../../domain/repositories/content-share.repository.interface.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { Visibility } from '../../../../../modules/container/domain/value-objects/visibility.vo.js';

@CommandHandler(CreateContentShareCommand)
export class CreateContentShareHandler implements ICommandHandler<
  CreateContentShareCommand,
  ContentShareEntity
> {
  private readonly logger = new Logger(CreateContentShareHandler.name);

  constructor(
    @Inject(CONTENT_SHARE_REPOSITORY) private readonly shareRepo: IContentShareRepository,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
  ) {}

  async execute(command: CreateContentShareCommand): Promise<ContentShareEntity> {
    if (command.callerUserId === command.sharedWithUserId) {
      throw new BadRequestException('Cannot share content with yourself');
    }

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

    const result = ContentShareEntity.create({
      entityType: command.entityType,
      entityId: command.entityId,
      sharedWithUserId: command.sharedWithUserId,
      sharedByUserId: command.callerUserId,
      permission: command.permission,
      expiresAt: command.expiresAt,
      note: command.note,
    });

    if (result.isFail) {
      if (result.error === ContentShareDomainError.CANNOT_SHARE_WITH_SELF) {
        throw new BadRequestException('Cannot share content with yourself');
      }
      throw new BadRequestException('Invalid share parameters');
    }

    try {
      return await this.shareRepo.save(result.value);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Share already exists for this user and entity');
      }
      this.logger.error('Failed to save content share', err);
      throw err;
    }
  }
}
