import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { RemoveGroupMaterialCommand } from './remove-group-material.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';
import {
  GROUP_MATERIAL_REPOSITORY,
  type IGroupMaterialRepository,
} from '../../../domain/repositories/group-material.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { GroupMaterialRemovedEvent } from '../../../domain/events/group-material-removed.event.js';
import { randomUUID } from 'crypto';

@CommandHandler(RemoveGroupMaterialCommand)
export class RemoveGroupMaterialHandler implements ICommandHandler<RemoveGroupMaterialCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(GROUP_MATERIAL_REPOSITORY) private readonly materialRepository: IGroupMaterialRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: RemoveGroupMaterialCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can manage group materials');
    }

    const group = await this.groupRepository.findById(command.groupId);
    if (!group || group.isDeleted || group.schoolId !== command.schoolId) {
      throw new NotFoundException(`Group ${command.groupId} not found`);
    }

    const existing = group.materials.find((m) => m.id === command.materialId);
    if (!existing) {
      throw new NotFoundException('Material not found');
    }

    await this.materialRepository.remove(command.groupId, command.materialId);

    for (const userId of group.memberUserIds) {
      await this.eventPublisher.publish(
        new GroupMaterialRemovedEvent(
          randomUUID(),
          command.schoolId,
          command.groupId,
          userId,
          existing.courseId,
        ),
      );
    }
  }
}
