import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ProvisionSoloWorkspaceCommand } from './provision-solo-workspace.command.js';
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
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolGroup } from '../../../domain/entities/school-group.entity.js';
import { SchoolKind } from '../../../domain/value-objects/school-kind.vo.js';

export interface ProvisionSoloWorkspaceResult {
  schoolId: string;
  groupId: string;
  /** False when the tutor already had a workspace — the call changed nothing. */
  created: boolean;
}

const DEFAULT_NAME = 'My students';

/**
 * Gives a private tutor the same workspace a school has (plan 59, variant B): a
 * `schools` row of kind SOLO that they own, and one group their learners belong to.
 * Everything downstream — assignments, review, analytics, scheduling — then works
 * for a tutor without a second authorisation model.
 *
 * Idempotent twice over: it returns the existing workspace when there is one, and
 * the slug is derived from the tutor's id, so two concurrent calls cannot create
 * two workspaces — the unique index rejects the second.
 */
@CommandHandler(ProvisionSoloWorkspaceCommand)
export class ProvisionSoloWorkspaceHandler
  implements ICommandHandler<ProvisionSoloWorkspaceCommand>
{
  private readonly logger = new Logger(ProvisionSoloWorkspaceHandler.name);

  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(GROUP_TEACHER_REPOSITORY) private readonly groupTeachers: IGroupTeacherRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: ProvisionSoloWorkspaceCommand): Promise<ProvisionSoloWorkspaceResult> {
    const name = command.name?.trim() || DEFAULT_NAME;

    const owned = await this.schoolRepository.findByOwnerId(command.tutorId);
    const existing = owned.find((s) => s.isSolo && !s.isDeleted);
    if (existing) {
      const groupId = await this.ensureDefaultGroup(existing.id, command.tutorId, name);
      return { schoolId: existing.id, groupId, created: false };
    }

    const school = School.create(
      {
        id: randomUUID(),
        name,
        // Derived from the owner, not from the name: it makes the row unique per
        // tutor and is never shown — a solo workspace has no public page.
        slug: `solo-${command.tutorId}`,
        ownerId: command.tutorId,
        description: command.description,
        avatarUrl: command.avatarUrl,
        kind: SchoolKind.SOLO,
      },
      randomUUID(),
    );

    await this.schoolRepository.save(school);
    for (const event of school.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }

    const groupId = await this.ensureDefaultGroup(school.id, command.tutorId, name);
    this.logger.log(
      `Provisioned solo workspace ${school.id} (group ${groupId}) for tutor ${command.tutorId}`,
    );

    return { schoolId: school.id, groupId, created: true };
  }

  /** One group per solo workspace: the first one found, or a new open one. */
  private async ensureDefaultGroup(
    schoolId: string,
    tutorId: string,
    name: string,
  ): Promise<string> {
    const groups = await this.groupRepository.findBySchoolId(schoolId);
    const existing = groups.find((g) => !g.isDeleted);
    if (existing) return existing.id;

    const group = SchoolGroup.create({ id: randomUUID(), schoolId, name, mode: 'online' });
    group.openAsSoloDefault();
    await this.groupRepository.save(group);

    await this.groupTeachers.save({
      id: randomUUID(),
      groupId: group.id,
      userId: tutorId,
      role: 'primary',
      createdAt: new Date(),
    });

    return group.id;
  }
}
