import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RemoveGroupMemberCommand } from './remove-group-member.command.js';
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
import { GroupMemberRemovedEvent } from '../../../domain/events/group-member-removed.event.js';

@CommandHandler(RemoveGroupMemberCommand)
export class RemoveGroupMemberHandler implements ICommandHandler<RemoveGroupMemberCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: RemoveGroupMemberCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isSelf = command.actorId === command.userId;
    const canManage =
      isOwner || actorRole === MemberRole.ADMIN || actorRole === MemberRole.TEACHER || isSelf;
    if (!canManage) {
      throw new ForbiddenOperationException(
        'Only owner, admin, teacher, or the member themselves can remove group members',
      );
    }

    const group = await this.groupRepository.findById(command.groupId);
    if (!group || group.isDeleted || group.schoolId !== command.schoolId) {
      throw new NotFoundException(`Group ${command.groupId} not found`);
    }

    await this.groupRepository.removeMember(command.groupId, command.userId);

    await this.eventPublisher.publish(
      new GroupMemberRemovedEvent(
        randomUUID(),
        command.schoolId,
        command.groupId,
        command.userId,
        group.courseId ?? null,
      ),
    );
  }
}
