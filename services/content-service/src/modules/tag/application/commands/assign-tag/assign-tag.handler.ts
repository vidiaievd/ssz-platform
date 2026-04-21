import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AssignTagCommand } from './assign-tag.command.js';
import { TagAssignmentEntity } from '../../../domain/entities/tag-assignment.entity.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TAG_REPOSITORY } from '../../../domain/repositories/tag.repository.interface.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import { TAG_ASSIGNMENT_REPOSITORY } from '../../../domain/repositories/tag-assignment.repository.interface.js';
import type { ITagAssignmentRepository } from '../../../domain/repositories/tag-assignment.repository.interface.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { AccessDeniedException } from '../../../../../shared/access-control/presentation/exceptions/access-denied.exception.js';

@CommandHandler(AssignTagCommand)
export class AssignTagHandler implements ICommandHandler<AssignTagCommand, TagAssignmentEntity> {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepo: ITagRepository,
    @Inject(TAG_ASSIGNMENT_REPOSITORY) private readonly assignmentRepo: ITagAssignmentRepository,
    private readonly checker: VisibilityCheckerService,
    private readonly registry: EntityResolverRegistry,
  ) {}

  async execute(command: AssignTagCommand): Promise<TagAssignmentEntity> {
    const tag = await this.tagRepo.findById(command.tagId);
    if (!tag || tag.deletedAt !== null)
      throw new NotFoundException(`Tag ${command.tagId} not found`);

    // Verify caller has edit access to the target entity.
    const entity = await this.registry.resolve(command.entityType, command.entityId);
    if (!entity)
      throw new NotFoundException(`Entity ${command.entityType}/${command.entityId} not found`);

    const decision = await this.checker.canAccess(
      { userId: command.userId, isPlatformAdmin: command.isPlatformAdmin, roles: [] },
      entity,
      'edit',
    );
    if (!decision.allowed) throw new AccessDeniedException(decision.reason);

    // School-scoped tag must target an entity that belongs to the same school.
    if (tag.scope === TagScope.SCHOOL && tag.ownerSchoolId !== null) {
      if (entity.ownerSchoolId !== tag.ownerSchoolId) {
        throw new UnprocessableEntityException(
          'School-scoped tag can only be assigned to entities owned by the same school',
        );
      }
    }

    const assignment = TagAssignmentEntity.create({
      tagId: tag.id,
      entityType: command.entityType,
      entityId: command.entityId,
      assignedByUserId: command.userId,
    });

    return this.assignmentRepo.save(assignment);
  }
}
