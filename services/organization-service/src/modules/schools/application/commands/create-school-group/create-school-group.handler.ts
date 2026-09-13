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
import {
  GROUP_TEACHER_REPOSITORY,
  type IGroupTeacherRepository,
} from '../../../domain/repositories/group-teacher.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { GroupPublishedEvent } from '../../../domain/events/group-published.event.js';

@CommandHandler(CreateSchoolGroupCommand)
export class CreateSchoolGroupHandler implements ICommandHandler<CreateSchoolGroupCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(GROUP_TEACHER_REPOSITORY) private readonly groupTeachers: IGroupTeacherRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
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
      ageBand: command.ageBand,
      capacityMin: command.capacityMin,
      capacityMax: command.capacityMax,
      startDate: command.startDate,
      endDate: command.endDate,
    });

    await this.groupRepository.save(group);

    // A school group is drafted by one person and taught by another, so it waits for the
    // publishing checklist. A private tutor is both, and a group of theirs left in draft
    // is a group nobody hears about — not the projections the progress screen reads, and
    // not the queue their own marking comes through (plan 59 §5). So theirs opens here,
    // with them on it, exactly as the workspace's own group does.
    if (school.isSolo) {
      group.openAsSoloGroup();
      await this.groupRepository.save(group);

      await this.groupTeachers.save({
        id: randomUUID(),
        groupId: group.id,
        userId: command.actorId,
        role: 'primary',
        createdAt: new Date(),
      });

      await this.eventPublisher.publish(
        new GroupPublishedEvent(
          randomUUID(),
          school.id,
          group.id,
          group.name,
          group.courseId ?? null,
          group.lang ?? null,
          group.level ?? null,
        ),
      );
    }

    return { id: group.id };
  }
}
