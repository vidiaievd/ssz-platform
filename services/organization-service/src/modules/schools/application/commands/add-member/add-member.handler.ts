import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AddMemberCommand } from './add-member.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { UserPlatformRoleAssignedEvent } from '../../../domain/events/user-platform-role-assigned.event.js';

const ROLES_REQUIRING_TUTOR: ReadonlySet<MemberRole> = new Set([MemberRole.TEACHER]);

@CommandHandler(AddMemberCommand)
export class AddMemberHandler implements ICommandHandler<AddMemberCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: AddMemberCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;

    // Only owner can directly assign admin role
    if (command.role === MemberRole.ADMIN && !isOwner) {
      throw new ForbiddenOperationException('Only the school owner can assign administrators');
    }

    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can add members');
    }

    const member = SchoolMember.create({
      id: randomUUID(),
      schoolId: command.schoolId,
      userId: command.userId,
      role: command.role,
      joinedAt: new Date(),
    });

    school.addMember(member, command.actorId, randomUUID());

    await this.schoolRepository.save(school);

    for (const event of school.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    school.clearDomainEvents();

    if (ROLES_REQUIRING_TUTOR.has(command.role)) {
      await this.eventPublisher.publish(
        new UserPlatformRoleAssignedEvent(randomUUID(), command.userId, 'Tutor'),
      );
    }
  }
}
