import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { MarkGroupAssignedSeenCommand } from './mark-group-assigned-seen.command.js';

@CommandHandler(MarkGroupAssignedSeenCommand)
export class MarkGroupAssignedSeenHandler implements ICommandHandler<MarkGroupAssignedSeenCommand> {
  constructor(
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
  ) {}

  async execute(command: MarkGroupAssignedSeenCommand): Promise<void> {
    const membership = await this.membershipRepo.findById(command.membershipId);
    if (!membership || membership.schoolId !== command.schoolId) {
      throw new MembershipNotFoundException(command.membershipId);
    }

    if (membership.studentId !== command.callerId) {
      throw new ForbiddenOperationException('Only the student can dismiss their own group-assigned banner');
    }

    if (membership.groupAssignedSeenAt) return;

    membership.markGroupAssignedSeen();
    await this.membershipRepo.save(membership);
  }
}
