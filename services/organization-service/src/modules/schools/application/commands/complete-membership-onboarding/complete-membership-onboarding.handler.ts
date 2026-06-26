import { randomUUID } from 'crypto';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { InvalidMembershipTransitionException } from '../../../domain/exceptions/invalid-membership-transition.exception.js';
import {
  SCHOOL_MEMBERSHIP_REPOSITORY,
  type ISchoolMembershipRepository,
} from '../../../domain/repositories/school-membership.repository.interface.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { CompleteMembershipOnboardingCommand } from './complete-membership-onboarding.command.js';
import { PlacementReviewReadyEvent } from '../../../domain/events/placement-review-ready.event.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';

@CommandHandler(CompleteMembershipOnboardingCommand)
export class CompleteMembershipOnboardingHandler
  implements ICommandHandler<CompleteMembershipOnboardingCommand>
{
  constructor(
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: ISchoolMembershipRepository,
    @Inject(SCHOOL_REPOSITORY)
    private readonly schoolRepo: ISchoolRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: CompleteMembershipOnboardingCommand): Promise<void> {
    const membership = await this.membershipRepo.findById(command.membershipId);
    if (!membership || membership.schoolId !== command.schoolId) {
      throw new MembershipNotFoundException(command.membershipId);
    }

    if (membership.studentId !== command.callerId) {
      throw new ForbiddenOperationException('Only the student can complete their own onboarding');
    }

    if (!membership.canTransitionTo('placement-review')) {
      throw new InvalidMembershipTransitionException(membership.status, 'placement-review');
    }

    membership.transitionTo('placement-review');
    await this.membershipRepo.save(membership);

    const school = await this.schoolRepo.findById(command.schoolId);
    if (school) {
      const adminIds = [
        school.ownerId,
        ...school.members
          .filter((m) => m.role === MemberRole.ADMIN || m.role === MemberRole.MANAGER)
          .map((m) => m.userId),
      ];
      await this.eventPublisher.publish(
        new PlacementReviewReadyEvent(
          randomUUID(),
          membership.id,
          school.id,
          school.name,
          membership.studentId,
          [...new Set(adminIds)],
        ),
      );
    }
  }
}
