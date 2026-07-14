import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PublishSchoolGroupCommand } from './publish-school-group.command.js';
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
import { GroupPublishedEvent } from '../../../domain/events/group-published.event.js';
import { GroupMemberAddedEvent } from '../../../domain/events/group-member-added.event.js';
import { GroupMaterialAddedEvent } from '../../../domain/events/group-material-added.event.js';
import { SchedulingServiceHttpClient } from '../../../../../infrastructure/scheduling/scheduling-service.http-client.js';

@CommandHandler(PublishSchoolGroupCommand)
export class PublishSchoolGroupHandler implements ICommandHandler<PublishSchoolGroupCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly schedulingClient: SchedulingServiceHttpClient,
  ) {}

  async execute(command: PublishSchoolGroupCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can publish groups');
    }

    const group = await this.groupRepository.findById(command.groupId);
    if (!group || group.isDeleted || group.schoolId !== command.schoolId) {
      throw new NotFoundException(`Group ${command.groupId} not found`);
    }

    if (group.status === 'active') return;

    const blockers = group.publish();

    // §3.6: for in-person groups, require ≥1 slot in scheduling-service
    if (group.mode !== 'online') {
      const slotCount = await this.schedulingClient.getGroupSlotCount(command.schoolId, command.groupId);
      if (slotCount !== null && slotCount === 0) {
        blockers.push('no-slots');
      }
    }

    if (blockers.length > 0) {
      throw new ConflictException({ blockers });
    }

    await this.groupRepository.save(group);

    await this.eventPublisher.publish(
      new GroupPublishedEvent(
        randomUUID(),
        command.schoolId,
        group.id,
        group.name,
        group.courseId ?? null,
        group.lang ?? null,
        group.level ?? null,
      ),
    );

    // Grant entitlements to all existing members now that group is active
    const now = new Date().toISOString();
    for (const member of group.members) {
      await this.eventPublisher.publish(
        new GroupMemberAddedEvent(
          randomUUID(),
          command.schoolId,
          group.id,
          member.userId,
          group.courseId ?? null,
          'active',
          now,
        ),
      );

      for (const material of group.materials) {
        await this.eventPublisher.publish(
          new GroupMaterialAddedEvent(
            randomUUID(),
            command.schoolId,
            group.id,
            member.userId,
            material.courseId,
            'active',
          ),
        );
      }
    }
  }
}
