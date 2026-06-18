import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ConflictException, Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TransferStudentCommand } from './transfer-student.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { MemberNotFoundException } from '../../../domain/exceptions/member-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GroupMemberAddedEvent } from '../../../domain/events/group-member-added.event.js';
import { GroupMemberRemovedEvent } from '../../../domain/events/group-member-removed.event.js';

@CommandHandler(TransferStudentCommand)
export class TransferStudentHandler implements ICommandHandler<TransferStudentCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: TransferStudentCommand): Promise<void> {
    const { actorId, schoolId, studentUserId, fromGroupId, toGroupId, role, override } = command;

    const school = await this.schoolRepository.findById(schoolId);
    if (!school) throw new SchoolNotFoundException(schoolId);

    const targetRole = school.getMemberRole(studentUserId);
    if (targetRole !== MemberRole.STUDENT) {
      throw new MemberNotFoundException(studentUserId);
    }

    const isOwner = actorId === school.ownerId;
    const actorRole = school.getMemberRole(actorId);
    const canManage = isOwner || actorRole === MemberRole.ADMIN || actorRole === MemberRole.TEACHER;
    if (!canManage) {
      throw new ForbiddenOperationException('Only owner, admin, or teacher can transfer students');
    }

    const [fromGroup, toGroup] = await Promise.all([
      this.groupRepository.findById(fromGroupId),
      this.groupRepository.findById(toGroupId),
    ]);

    if (!fromGroup || fromGroup.isDeleted || fromGroup.schoolId !== schoolId || !fromGroup.memberUserIds.includes(studentUserId)) {
      throw new UnprocessableEntityException({ error: 'source-not-found' });
    }
    if (!toGroup || toGroup.isDeleted || toGroup.schoolId !== schoolId) {
      throw new NotFoundException(`Group ${toGroupId} not found`);
    }
    if (toGroup.status === 'archived') {
      throw new UnprocessableEntityException({ error: 'target-archived' });
    }
    if (toGroup.memberUserIds.includes(studentUserId)) {
      throw new UnprocessableEntityException({ error: 'already-member' });
    }
    if (
      !override &&
      toGroup.capacityMax != null &&
      toGroup.studentCount >= toGroup.capacityMax
    ) {
      throw new ConflictException({ error: 'capacity', overridable: true });
    }

    const now = new Date();
    await this.prisma.$transaction([
      (this.prisma as any).schoolGroupMember.updateMany({
        where: { groupId: fromGroupId, userId: studentUserId, status: 'active' },
        data: { status: 'past', exitedAt: now },
      }),
      (this.prisma as any).schoolGroupMember.upsert({
        where: { groupId_userId: { groupId: toGroupId, userId: studentUserId } },
        create: { id: randomUUID(), groupId: toGroupId, userId: studentUserId, role, addedAt: now },
        update: { role, status: 'active', addedAt: now, exitedAt: null },
      }),
    ] as any);

    await this.eventPublisher.publish(
      new GroupMemberRemovedEvent(randomUUID(), schoolId, fromGroupId, studentUserId, fromGroup.courseId ?? null),
    );
    await this.eventPublisher.publish(
      new GroupMemberAddedEvent(
        randomUUID(),
        schoolId,
        toGroupId,
        studentUserId,
        toGroup.courseId ?? null,
        toGroup.status,
        now.toISOString(),
      ),
    );
  }
}
