import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { SetMembershipAvailabilityCommand } from './set-membership-availability.command.js';

@CommandHandler(SetMembershipAvailabilityCommand)
export class SetMembershipAvailabilityHandler implements ICommandHandler<SetMembershipAvailabilityCommand> {
  constructor(
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
  ) {}

  async execute(command: SetMembershipAvailabilityCommand): Promise<void> {
    const membership = await this.membershipRepo.findById(command.membershipId);
    if (!membership || membership.schoolId !== command.schoolId) {
      throw new MembershipNotFoundException(command.membershipId);
    }

    // Only the student themselves or an admin can set availability
    if (membership.studentId !== command.callerId) {
      throw new ForbiddenOperationException('Only the student can set their own availability');
    }

    membership.setAvailability(command.prefs);
    await this.membershipRepo.save(membership);
  }
}
