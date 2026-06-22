import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { SetMembershipAgeBandCommand } from './set-membership-age-band.command.js';

@CommandHandler(SetMembershipAgeBandCommand)
export class SetMembershipAgeBandHandler implements ICommandHandler<SetMembershipAgeBandCommand> {
  constructor(
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
  ) {}

  async execute(command: SetMembershipAgeBandCommand): Promise<void> {
    const membership = await this.membershipRepo.findById(command.membershipId);
    if (!membership || membership.schoolId !== command.schoolId) {
      throw new MembershipNotFoundException(command.membershipId);
    }

    // Only the student themselves or an admin can set their age band
    if (membership.studentId !== command.callerId) {
      throw new ForbiddenOperationException('Only the student can set their own age band');
    }

    membership.setAgeBand(command.ageBand);
    await this.membershipRepo.save(membership);
  }
}
