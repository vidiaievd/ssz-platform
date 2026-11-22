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
import { GroupPublishedEvent } from '../../../domain/events/group-published.event.js';

export interface ProvisionSoloWorkspaceResult {
  schoolId: string;
  /** Null only for a workspace that is not active and has lost its group. */
  groupId: string | null;
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
 *
 * A suspended or closed workspace is still the tutor's one (plan 90, live check, block 9):
 * it is returned as it is, read only, and nothing is written into it — the tutor sees the
 * banner and gets it back through support. Only once it is purged does a new one open; the
 * tombstone keeps `solo-<tutorId>`, so the new one takes the next free `solo-<tutorId>-<n>`.
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

    // Purged tombstones are not in this list; every other status is.
    const owned = await this.schoolRepository.findByOwnerId(command.tutorId);
    const existing = owned.find((s) => s.isSolo);
    if (existing) {
      const groupId =
        existing.status === 'active'
          ? await this.ensureDefaultGroup(existing.id, command.tutorId, name)
          : await this.findDefaultGroup(existing.id);
      return { schoolId: existing.id, groupId, created: false };
    }

    const school = School.create(
      {
        id: randomUUID(),
        name,
        // Derived from the owner, not from the name: it makes the row unique per
        // tutor and is never shown — a solo workspace has no public page.
        slug: await this.freeSlug(command.tutorId),
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

  /**
   * `solo-<tutorId>`, or after a purge (the tombstone keeps its slug) the first free
   * `solo-<tutorId>-<n>`. A race between two calls still ends in the unique index.
   */
  private async freeSlug(tutorId: string): Promise<string> {
    const base = `solo-${tutorId}`;
    if (!(await this.schoolRepository.findBySlug(base))) return base;
    for (let n = 2; ; n++) {
      const slug = `${base}-${n}`;
      if (!(await this.schoolRepository.findBySlug(slug))) return slug;
    }
  }

  /** The default group of a workspace that may not be written to; null if it has none. */
  private async findDefaultGroup(schoolId: string): Promise<string | null> {
    const groups = (await this.groupRepository.findBySchoolId(schoolId)).filter((g) => !g.isDeleted);
    return (groups.find((g) => g.isDefault) ?? groups[0])?.id ?? null;
  }

  /**
   * The workspace's default group: the one that holds every learner the tutor takes on.
   *
   * Named by a flag rather than by being first in the list — a tutor may now have groups
   * of their own beside it (plan 59 §5), and "whichever row came back first" stops being
   * the same group the moment there are two. A workspace provisioned before the flag
   * existed has its oldest group adopted as the default, which is what it has always been.
   */
  private async ensureDefaultGroup(
    schoolId: string,
    tutorId: string,
    name: string,
  ): Promise<string> {
    const groups = (await this.groupRepository.findBySchoolId(schoolId)).filter(
      (g) => !g.isDeleted,
    );

    const marked = groups.find((g) => g.isDefault);
    if (marked) return marked.id;

    const oldest = groups[0];
    if (oldest) {
      oldest.openAsSoloDefault();
      await this.groupRepository.save(oldest);
      return oldest.id;
    }

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

    // The group opens here instead of through `publish-school-group`, so the event that
    // command sends has to be sent here too — it is what puts the group in the
    // projections the analytics screens read (plan 59 §1.1 F).
    await this.eventPublisher.publish(
      new GroupPublishedEvent(
        randomUUID(),
        schoolId,
        group.id,
        group.name,
        group.courseId ?? null,
        group.lang ?? null,
        group.level ?? null,
      ),
    );

    return group.id;
  }
}
