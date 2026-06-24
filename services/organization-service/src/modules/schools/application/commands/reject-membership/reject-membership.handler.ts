import { randomUUID } from 'crypto';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { InvalidMembershipTransitionException } from '../../../domain/exceptions/invalid-membership-transition.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { RejectMembershipCommand } from './reject-membership.command.js';
import { EnrollmentRejectedEvent } from '../../../domain/events/enrollment-rejected.event.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';

@CommandHandler(RejectMembershipCommand)
export class RejectMembershipHandler implements ICommandHandler<RejectMembershipCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: RejectMembershipCommand): Promise<void> {
    const school = await this.schoolRepo.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const role = school.getMemberRole(command.callerId);
    if (command.callerId !== school.ownerId && role !== MemberRole.ADMIN) {
      throw new ForbiddenOperationException('Only OWNER or ADMIN can reject memberships');
    }

    const membership = await this.membershipRepo.findById(command.membershipId);
    if (!membership || membership.schoolId !== command.schoolId) {
      throw new MembershipNotFoundException(command.membershipId);
    }

    if (!membership.canTransitionTo('rejected')) {
      throw new InvalidMembershipTransitionException(membership.status, 'rejected');
    }
    membership.transitionTo('rejected');
    await this.membershipRepo.save(membership);

    await this.eventPublisher.publish(
      new EnrollmentRejectedEvent(randomUUID(), membership.id, school.id, school.name, membership.studentId),
    );
  }
}
