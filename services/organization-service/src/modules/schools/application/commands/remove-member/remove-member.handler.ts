import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ConflictException, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RemoveMemberCommand } from './remove-member.command.js';
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
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

@CommandHandler(RemoveMemberCommand)
export class RemoveMemberHandler implements ICommandHandler<RemoveMemberCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: RemoveMemberCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    // §4.3: block removing a teacher who is primary of at least one active group
    const memberRole = school.getMemberRole(command.userId);
    if (memberRole === MemberRole.TEACHER) {
      const blockedGroups = await this.groupRepository.findActiveGroupsWithPrimaryTeacher(
        command.schoolId,
        command.userId,
      );
      if (blockedGroups.length > 0) {
        throw new ConflictException({
          error: 'primary-of-active-groups',
          message: 'Reassign primary teacher before removing this member',
          groups: blockedGroups.map((g) => ({ id: g.id, name: g.name })),
        });
      }
    }

    school.removeMember(command.userId, command.actorId, randomUUID());

    await this.schoolRepository.save(school);

    for (const event of school.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
  }
}
