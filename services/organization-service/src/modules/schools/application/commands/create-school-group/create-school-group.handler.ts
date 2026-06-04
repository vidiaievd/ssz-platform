import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateSchoolGroupCommand } from './create-school-group.command.js';
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
import { SchoolGroup } from '../../../domain/entities/school-group.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

@CommandHandler(CreateSchoolGroupCommand)
export class CreateSchoolGroupHandler implements ICommandHandler<CreateSchoolGroupCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
  ) {}

  async execute(command: CreateSchoolGroupCommand): Promise<{ id: string }> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can manage school groups');
    }

    const group = SchoolGroup.create({
      id: randomUUID(),
      schoolId: command.schoolId,
      name: command.name,
      description: command.description,
      mode: command.mode,
      courseId: command.courseId,
      lang: command.lang,
      level: command.level,
      capacityMin: command.capacityMin,
      capacityMax: command.capacityMax,
      startDate: command.startDate,
      endDate: command.endDate,
    });

    await this.groupRepository.save(group);

    return { id: group.id };
  }
}
