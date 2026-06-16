import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { InvalidMembershipTransitionException } from '../../../domain/exceptions/invalid-membership-transition.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { AddGroupMemberCommand } from '../add-group-member/add-group-member.command.js';
import { AssignMembershipGroupCommand } from './assign-membership-group.command.js';

@CommandHandler(AssignMembershipGroupCommand)
export class AssignMembershipGroupHandler implements ICommandHandler<AssignMembershipGroupCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: AssignMembershipGroupCommand): Promise<void> {
    const school = await this.schoolRepo.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const role = school.getMemberRole(command.callerId);
    if (command.callerId !== school.ownerId && role !== MemberRole.ADMIN) {
      throw new ForbiddenOperationException('Only OWNER or ADMIN can assign students to groups');
    }

    const membership = await this.membershipRepo.findById(command.membershipId);
    if (!membership || membership.schoolId !== command.schoolId) {
      throw new MembershipNotFoundException(command.membershipId);
    }

    if (!membership.canTransitionTo('active')) {
      throw new InvalidMembershipTransitionException(membership.status, 'active');
    }

    // Reuse existing add-group-member flow (handles capacity + clash validation)
    await this.commandBus.execute(
      new AddGroupMemberCommand(command.callerId, command.schoolId, command.groupId, membership.studentId),
    );

    membership.transitionTo('active');
    await this.membershipRepo.save(membership);
  }
}
