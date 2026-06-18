import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { UpdateGroupMemberRoleCommand } from './update-group-member-role.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

@CommandHandler(UpdateGroupMemberRoleCommand)
export class UpdateGroupMemberRoleHandler implements ICommandHandler<UpdateGroupMemberRoleCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: UpdateGroupMemberRoleCommand): Promise<void> {
    const { actorId, schoolId, groupId, userId, role } = command;

    const school = await this.schoolRepository.findById(schoolId);
    if (!school) throw new SchoolNotFoundException(schoolId);

    const actorRole = school.getMemberRole(actorId);
    const isOwner = actorId === school.ownerId;
    const isSelf = actorId === userId;
    const canManage =
      isOwner || actorRole === MemberRole.ADMIN || actorRole === MemberRole.TEACHER || isSelf;
    if (!canManage) {
      throw new ForbiddenOperationException(
        'Only owner, admin, teacher, or the member themselves can change group member role',
      );
    }

    const group = await this.groupRepository.findById(groupId);
    if (!group || group.isDeleted || group.schoolId !== schoolId) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }

    const result = await (this.prisma as any).schoolGroupMember.updateMany({
      where: { groupId, userId, status: 'active' },
      data: { role },
    });
    if (result.count === 0) {
      throw new NotFoundException(`User ${userId} is not an active member of group ${groupId}`);
    }
  }
}
