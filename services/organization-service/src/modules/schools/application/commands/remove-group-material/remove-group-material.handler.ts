import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { RemoveGroupMaterialCommand } from './remove-group-material.command.js';
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

@CommandHandler(RemoveGroupMaterialCommand)
export class RemoveGroupMaterialHandler implements ICommandHandler<RemoveGroupMaterialCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(GROUP_MATERIAL_REPOSITORY) private readonly materialRepository: IGroupMaterialRepository,
  ) {}

  async execute(command: RemoveGroupMaterialCommand): Promise<void> {
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

    const existing = group.materials.find((m) => m.id === command.materialId);
    if (!existing) {
      throw new NotFoundException('Material not found');
    }

    await this.materialRepository.remove(command.groupId, command.materialId);
  }
}
