import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { RemoveGroupTeacherCommand } from './remove-group-teacher.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';
import {
  GROUP_TEACHER_REPOSITORY,
  type IGroupTeacherRepository,
} from '../../../domain/repositories/group-teacher.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

@CommandHandler(RemoveGroupTeacherCommand)
export class RemoveGroupTeacherHandler implements ICommandHandler<RemoveGroupTeacherCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(GROUP_TEACHER_REPOSITORY) private readonly teacherRepository: IGroupTeacherRepository,
  ) {}

  async execute(command: RemoveGroupTeacherCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can manage group teachers');
    }

    const group = await this.groupRepository.findById(command.groupId);
    if (!group || group.isDeleted || group.schoolId !== command.schoolId) {
      throw new NotFoundException(`Group ${command.groupId} not found`);
    }

    const existing = await this.teacherRepository.findByGroupAndUser(
      command.groupId,
      command.userId,
      command.role,
    );
    if (!existing) {
      throw new NotFoundException(`Teacher assignment not found`);
    }

    await this.teacherRepository.remove(command.groupId, command.userId, command.role);
  }
}
