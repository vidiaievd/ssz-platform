import { randomUUID } from 'crypto';
import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { InvalidMembershipTransitionException } from '../../../domain/exceptions/invalid-membership-transition.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { AddMemberCommand } from '../add-member/add-member.command.js';
import { ApproveMembershipCommand } from './approve-membership.command.js';
import { EnrollmentApprovedEvent } from '../../../domain/events/enrollment-approved.event.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';

@CommandHandler(ApproveMembershipCommand)
export class ApproveMembershipHandler implements ICommandHandler<ApproveMembershipCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: ApproveMembershipCommand): Promise<void> {
    const school = await this.schoolRepo.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const role = school.getMemberRole(command.callerId);
    if (command.callerId !== school.ownerId && role !== MemberRole.ADMIN) {
      throw new ForbiddenOperationException('Only OWNER or ADMIN can approve memberships');
    }

    const membership = await this.membershipRepo.findById(command.membershipId);
    if (!membership || membership.schoolId !== command.schoolId) {
      throw new MembershipNotFoundException(command.membershipId);
    }

    if (!membership.canTransitionTo('onboarding')) {
      throw new InvalidMembershipTransitionException(membership.status, 'onboarding');
    }

    // Ensure the student is a school member so they appear in the roster and can be
    // added to groups later, before committing the approval — a roster-add failure
    // must fail the whole approval rather than be silently dropped, otherwise the
    // resulting ENROLLMENT_APPROVED event would misrepresent what actually happened.
    if (!school.getMemberRole(membership.studentId)) {
      await this.commandBus.execute(
        new AddMemberCommand(command.callerId, command.schoolId, membership.studentId, MemberRole.STUDENT),
      );
    }

    membership.transitionTo('onboarding');
    await this.membershipRepo.save(membership);

    await this.eventPublisher.publish(
      new EnrollmentApprovedEvent(randomUUID(), membership.id, school.id, school.name, membership.studentId),
    );
  }
}
