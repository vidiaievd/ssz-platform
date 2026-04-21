import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { RemoveTagAssignmentCommand } from './remove-tag-assignment.command.js';
import { TAG_ASSIGNMENT_REPOSITORY } from '../../../domain/repositories/tag-assignment.repository.interface.js';
import type { ITagAssignmentRepository } from '../../../domain/repositories/tag-assignment.repository.interface.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { AccessDeniedException } from '../../../../../shared/access-control/presentation/exceptions/access-denied.exception.js';

@CommandHandler(RemoveTagAssignmentCommand)
export class RemoveTagAssignmentHandler implements ICommandHandler<
  RemoveTagAssignmentCommand,
  void
> {
  constructor(
    @Inject(TAG_ASSIGNMENT_REPOSITORY) private readonly assignmentRepo: ITagAssignmentRepository,
    private readonly checker: VisibilityCheckerService,
    private readonly registry: EntityResolverRegistry,
  ) {}

  async execute(command: RemoveTagAssignmentCommand): Promise<void> {
    const assignment = await this.assignmentRepo.findByTagAndEntity(
      command.tagId,
      command.entityType,
      command.entityId,
    );
    if (!assignment) throw new NotFoundException('Tag assignment not found');

    const entity = await this.registry.resolve(command.entityType, command.entityId);
    if (!entity)
      throw new NotFoundException(`Entity ${command.entityType}/${command.entityId} not found`);

    const decision = await this.checker.canAccess(
      { userId: command.userId, isPlatformAdmin: command.isPlatformAdmin, roles: [] },
      entity,
      'edit',
    );
    if (!decision.allowed) throw new AccessDeniedException(decision.reason);

    await this.assignmentRepo.delete(assignment.id);
  }
}
