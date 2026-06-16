import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { InvalidMembershipTransitionException } from '../../../domain/exceptions/invalid-membership-transition.exception.js';
import {
  SCHOOL_MEMBERSHIP_REPOSITORY,
  type ISchoolMembershipRepository,
} from '../../../domain/repositories/school-membership.repository.interface.js';
import { CompleteMembershipOnboardingCommand } from './complete-membership-onboarding.command.js';

@CommandHandler(CompleteMembershipOnboardingCommand)
export class CompleteMembershipOnboardingHandler
  implements ICommandHandler<CompleteMembershipOnboardingCommand>
{
  constructor(
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: ISchoolMembershipRepository,
  ) {}

  async execute(command: CompleteMembershipOnboardingCommand): Promise<void> {
    const membership = await this.membershipRepo.findById(command.membershipId);
    if (!membership || membership.schoolId !== command.schoolId) {
      throw new MembershipNotFoundException(command.membershipId);
    }

    if (membership.studentId !== command.callerId) {
      throw new ForbiddenOperationException('Only the student can complete their own onboarding');
    }

    if (!membership.canTransitionTo(command.to)) {
      throw new InvalidMembershipTransitionException(membership.status, command.to);
    }

    membership.transitionTo(command.to);
    await this.membershipRepo.save(membership);
  }
}
