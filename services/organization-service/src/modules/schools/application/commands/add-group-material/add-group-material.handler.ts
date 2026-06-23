import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AddGroupMaterialCommand } from './add-group-material.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';
import {
  GROUP_MATERIAL_REPOSITORY,
  type IGroupMaterialRepository,
} from '../../../domain/repositories/group-material.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

export interface AddGroupMaterialResult {
  id: string;
}

@CommandHandler(AddGroupMaterialCommand)
export class AddGroupMaterialHandler implements ICommandHandler<AddGroupMaterialCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(GROUP_MATERIAL_REPOSITORY) private readonly materialRepository: IGroupMaterialRepository,
  ) {}

  async execute(command: AddGroupMaterialCommand): Promise<AddGroupMaterialResult> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can manage group materials');
    }

    const group = await this.groupRepository.findById(command.groupId);
    if (!group || group.isDeleted || group.schoolId !== command.schoolId) {
      throw new NotFoundException(`Group ${command.groupId} not found`);
    }

    if (group.courseId === command.courseId) {
      throw new ConflictException('This course is already the group\'s main material');
    }

    const existing = await this.materialRepository.findByGroupAndCourse(
      command.groupId,
      command.courseId,
    );
    if (existing) {
      throw new ConflictException('This course is already attached as a material');
    }

    const id = randomUUID();
    await this.materialRepository.add({
      id,
      groupId: command.groupId,
      courseId: command.courseId,
      addedAt: new Date(),
    });

    return { id };
  }
}
