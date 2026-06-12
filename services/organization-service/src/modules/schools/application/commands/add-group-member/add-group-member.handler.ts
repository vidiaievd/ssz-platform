import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AddGroupMemberCommand } from './add-group-member.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { GroupMemberAddedEvent } from '../../../domain/events/group-member-added.event.js';

@CommandHandler(AddGroupMemberCommand)
export class AddGroupMemberHandler implements ICommandHandler<AddGroupMemberCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: AddGroupMemberCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const canManage = isOwner || actorRole === MemberRole.ADMIN || actorRole === MemberRole.TEACHER;
    if (!canManage) {
      throw new ForbiddenOperationException('Only owner, admin, or teacher can manage group members');
    }

    const targetRole = school.getMemberRole(command.userId);
    if (!targetRole) {
      throw new ForbiddenOperationException('User is not a member of this school');
    }

    const group = await this.groupRepository.findById(command.groupId);
    if (!group || group.isDeleted || group.schoolId !== command.schoolId) {
      throw new NotFoundException(`Group ${command.groupId} not found`);
    }

    await this.groupRepository.saveWithMember(group, command.userId, randomUUID());

    await this.eventPublisher.publish(
      new GroupMemberAddedEvent(
        randomUUID(),
        command.schoolId,
        command.groupId,
        command.userId,
        group.courseId ?? null,
        group.status,
        new Date().toISOString(),
      ),
    );
  }
}
