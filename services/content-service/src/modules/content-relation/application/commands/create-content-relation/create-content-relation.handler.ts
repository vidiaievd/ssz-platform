import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CreateContentRelationCommand } from './create-content-relation.command.js';
import { ContentRelationEntity } from '../../../domain/entities/content-relation.entity.js';
import {
  CONTENT_RELATION_REPOSITORY,
  type IContentRelationRepository,
} from '../../../domain/repositories/content-relation.repository.interface.js';
import { ContentRelationDomainError } from '../../../domain/exceptions/content-relation-domain.exceptions.js';
import { RelatableEntityExistenceChecker } from '../../services/relatable-entity-existence-checker.service.js';

@CommandHandler(CreateContentRelationCommand)
export class CreateContentRelationHandler implements ICommandHandler<
  CreateContentRelationCommand,
  ContentRelationEntity
> {
  constructor(
    @Inject(CONTENT_RELATION_REPOSITORY) private readonly repo: IContentRelationRepository,
    private readonly existenceChecker: RelatableEntityExistenceChecker,
  ) {}

  async execute(command: CreateContentRelationCommand): Promise<ContentRelationEntity> {
    if (command.sourceType === command.targetType && command.sourceId === command.targetId) {
      throw new UnprocessableEntityException(ContentRelationDomainError.SOURCE_EQUALS_TARGET);
    }

    const [sourceExists, targetExists] = await Promise.all([
      this.existenceChecker.exists(command.sourceType, command.sourceId),
      this.existenceChecker.exists(command.targetType, command.targetId),
    ]);
    if (!sourceExists) {
      throw new NotFoundException(ContentRelationDomainError.SOURCE_NOT_FOUND);
    }
    if (!targetExists) {
      throw new NotFoundException(ContentRelationDomainError.TARGET_NOT_FOUND);
    }

    const existing = await this.repo.findExact(
      command.sourceType,
      command.sourceId,
      command.relationKind,
      command.targetType,
      command.targetId,
    );
    if (existing) return existing;

    const relation = ContentRelationEntity.create({
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      targetType: command.targetType,
      targetId: command.targetId,
      relationKind: command.relationKind,
      ownerSchoolId: command.ownerSchoolId,
      createdByUserId: command.createdByUserId,
    });

    return this.repo.save(relation);
  }
}
