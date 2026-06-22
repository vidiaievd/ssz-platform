import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { UpdateSchoolGroupCommand } from './update-school-group.command.js';
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

@CommandHandler(UpdateSchoolGroupCommand)
export class UpdateSchoolGroupHandler implements ICommandHandler<UpdateSchoolGroupCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
  ) {}

  async execute(command: UpdateSchoolGroupCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can manage school groups');
    }

    const group = await this.groupRepository.findById(command.groupId);
    if (!group || group.isDeleted || group.schoolId !== command.schoolId) {
      throw new NotFoundException(`Group ${command.groupId} not found`);
    }

    // Main material can be reassigned but never cleared back to "no course"
    // once set — see school-group.entity.ts's update() for the same guard
    // (defense in depth); this is where the HTTP-meaningful 409 originates.
    if (command.courseId === null && group.courseId != null) {
      throw new ConflictException({
        error: 'main-material-required',
        message: 'The main material cannot be removed once set — reassign it instead',
      });
    }

    group.update({
      name: command.name,
      description: command.description,
      mode: command.mode,
      courseId: command.courseId,
      lang: command.lang,
      level: command.level,
      ageBand: command.ageBand,
      capacityMin: command.capacityMin,
      capacityMax: command.capacityMax,
      startDate: command.startDate,
      endDate: command.endDate,
    });

    await this.groupRepository.save(group);
  }
}
